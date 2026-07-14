import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderChannelType, OrderPaymentStatus, OrderStage, OrderStatus, FulfillmentStatus } from '../entities/order.entity';
import { OrderLine } from '../entities/order-line.entity';
import { SagaState, SagaType } from '../entities/saga-state.entity';
import { ComposeOrderDto, ComposeOrderResponseDto, ComposeOrderLineDto } from './dto/compose-order.dto';
import { CheckoutSagaOrchestrator } from '../checkout/saga/checkout-saga.orchestrator';
import type { MyOrderDetailDto, MyOrderStatusDto, MyOrderSummaryDto } from '@temp-nx/api-types/order';

interface CartLineResponse {
  variantId: string;
  qty: number;
  unitPriceMinor: number;
  currency: string;
  productId: string;
  name: string;
  optionSummary: string;
  imageUrl: string | null;
  storeId: string;
  problems: string[];
}

interface CartGroupResponse {
  storeId: string;
  lineVariantIds: string[];
  subtotalMinor: number;
}

interface CartValidateResponse {
  lines: CartLineResponse[];
  groups: CartGroupResponse[];
}

@Injectable()
export class StorefrontService {
  private readonly catalogBaseUrl: string;

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderLine)
    private readonly orderLineRepository: Repository<OrderLine>,
    @InjectRepository(SagaState)
    private readonly sagaStateRepository: Repository<SagaState>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly orchestrator: CheckoutSagaOrchestrator,
  ) {
    this.catalogBaseUrl = this.configService
      .get<string>('CATALOG_SERVICE_URL', 'http://localhost:3002/api')
      .replace(/\/$/, '');
  }

  async composeOrder(customerId: string, dto: ComposeOrderDto): Promise<ComposeOrderResponseDto> {
    if (!dto.lines.length) {
      throw new UnprocessableEntityException('Order must contain at least one line');
    }

    const { groups, lines: validatedLines } = await this.resolveLines(dto.lines);
    const address = this.resolveAddress(dto.shippingAddress);

    return this.placeGroupOrders(customerId, groups, validatedLines, dto, address);
  }

  private async resolveLines(lines: ComposeOrderLineDto[]): Promise<CartValidateResponse> {
    const response = await fetch(`${this.catalogBaseUrl}/storefront/cart/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
    });

    if (!response.ok) {
      throw new UnprocessableEntityException('Failed to validate cart with catalog service');
    }

    const data = await response.json() as CartValidateResponse;
    return data;
  }

  private resolveAddress(shippingAddress: Record<string, unknown>): Record<string, unknown> {
    // In a real app, we might normalize or validate the address here.
    return shippingAddress;
  }

  private async placeGroupOrders(
    customerId: string,
    groups: CartGroupResponse[],
    validatedLines: CartLineResponse[],
    dto: ComposeOrderDto,
    address: Record<string, unknown>
  ): Promise<ComposeOrderResponseDto> {
    const orders: ComposeOrderResponseDto['orders'] = [];
    const failedGroups: ComposeOrderResponseDto['failedGroups'] = [];

    const lineMap = new Map<string, CartLineResponse>();
    for (const line of validatedLines) {
      lineMap.set(line.variantId, line);
    }

    for (const group of groups) {
      // Check for problems in any of this group's lines
      const groupLines = group.lineVariantIds.map(id => lineMap.get(id)!);
      const problems = groupLines.flatMap(l => l.problems);

      // Check if price drift occurred by matching requested price vs actual
      const driftProblems = dto.lines
        .filter(l => group.lineVariantIds.includes(l.variantId))
        .map(reqLine => {
          const actual = lineMap.get(reqLine.variantId)!;
          if (reqLine.expectedPriceMinor !== actual.unitPriceMinor) {
            return `Price drift on variant ${actual.name}: requested ${reqLine.expectedPriceMinor}, actual ${actual.unitPriceMinor}`;
          }
          return null;
        })
        .filter((p): p is string => p !== null);
      
      const allProblems = [...problems, ...driftProblems];

      if (allProblems.length > 0) {
        failedGroups.push({
          storeId: group.storeId,
          reason: 'Validation failed',
          problems: allProblems,
        });
        continue;
      }

      // Generate a simple displayNumber (in real app, use sequence)
      const displayNumber = Math.floor(Math.random() * 1000000);

      // Create Order in transaction
      let createdOrderId: string | null = null;
      let createdOrderStoreId: string | null = null;

      await this.dataSource.transaction(async (manager) => {
        const order = manager.create(Order, {
          storeId: group.storeId,
          customerId,
          displayNumber,
          channelType: OrderChannelType.OnlineStore,
          status: OrderStatus.Open,
          paymentStatus: OrderPaymentStatus.Pending,
          fulfillmentStatus: FulfillmentStatus.Unfulfilled,
          stage: OrderStage.ReviewOrder,
          subtotalMinor: group.subtotalMinor,
          shippingFeeMinor: 0, // Simplified: should probably be resolved if shipping rules exist
          discountMinor: 0,
          taxMinor: 0,
          totalMinor: group.subtotalMinor, // simplified
          currency: groupLines[0].currency, // assume same currency
          shippingAddress: address,
          contactEmail: dto.contactEmail,
          contactPhone: dto.contactPhone,
        });

        await manager.save(order);
        createdOrderId = order.id;
        createdOrderStoreId = order.storeId;

        for (const vLine of groupLines) {
          // Find matching original line for expected qty
          const originalLine = dto.lines.find(l => l.variantId === vLine.variantId);
          if (!originalLine) continue;

          const line = manager.create(OrderLine, {
            order,
            variantId: vLine.variantId,
            productId: vLine.productId,
            name: vLine.name,
            qty: originalLine.qty, // Cart validation doesn't echo back qty, it checks it. Wait, the response does echo qty.
            // But let's use the actual qty we validated
            unitPriceMinor: vLine.unitPriceMinor,
            variantLabel: vLine.optionSummary,
            imageFileId: vLine.imageUrl,
          });
          // Fix qty if it is echoed back from catalog
          line.qty = vLine.qty || originalLine.qty;
          await manager.save(line);
        }

        orders.push(this.toCheckoutResponse(order));
      });

      // Start the checkout saga for the successfully placed order
      if (createdOrderId && createdOrderStoreId) {
        await this.orchestrator.start(createdOrderStoreId, createdOrderId, null);
      }
    }

    if (orders.length === 0 && failedGroups.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Order composition failed',
        failedGroups,
      });
    }

    return {
      orders,
      failedGroups,
    };
  }

  private toCheckoutResponse(order: Order) {
    return {
      id: order.id,
      displayNumber: order.displayNumber,
      storeId: order.storeId,
      status: order.status,
      totalMinor: order.totalMinor,
      currency: order.currency,
    };
  }

  private toOrderSummary(order: Order): MyOrderSummaryDto {
    return {
      id: order.id,
      displayNumber: order.displayNumber,
      storeId: order.storeId,
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      paymentStatus: order.paymentStatus,
      stage: order.stage,
      totalMinor: order.totalMinor,
      currency: order.currency,
      createdAt: order.orderDate.toISOString(),
    };
  }

  private toOrderDetail(order: Order, lines: OrderLine[]): MyOrderDetailDto {
    return {
      ...this.toOrderSummary(order),
      subtotalMinor: order.subtotalMinor,
      shippingFeeMinor: order.shippingFeeMinor,
      discountMinor: order.discountMinor,
      taxMinor: order.taxMinor,
      shippingAddress: order.shippingAddress ?? null,
      contactEmail: order.contactEmail ?? null,
      contactPhone: order.contactPhone ?? null,
      paymentId: order.paymentId ?? null,
      shipmentDisplayId: order.shipmentDisplayId ?? null,
      lines: lines.map((line) => ({
        id: line.id,
        variantId: line.variantId,
        productId: line.productId ?? null,
        name: line.name,
        sku: line.sku ?? null,
        variantLabel: line.variantLabel ?? null,
        qty: line.qty,
        fulfilledQty: line.fulfilledQty,
        unitPriceMinor: line.unitPriceMinor,
        imageFileId: line.imageFileId ?? null,
      })),
    };
  }

  async getMyOrders(customerId: string): Promise<MyOrderSummaryDto[]> {
    const orders = await this.orderRepository.find({
      where: { customerId },
      order: { orderDate: 'DESC' },
    });

    return orders.map((order) => this.toOrderSummary(order));
  }

  /** Customer-scoped 404 discipline: filtering by `customerId` in the query
   * means a wrong-owner id 404s the same way a missing id does — no
   * separate ownership check needed (the `assertOwnedByStore` analogue for
   * this entity, done via the query itself). */
  async getOrderDetail(customerId: string, orderId: string): Promise<MyOrderDetailDto> {
    const order = await this.orderRepository.findOne({ where: { id: orderId, customerId } });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const lines = await this.orderLineRepository.find({ where: { order: { id: orderId } } });
    return this.toOrderDetail(order, lines);
  }

  async getOrderStatus(customerId: string, orderId: string): Promise<MyOrderStatusDto> {
    const order = await this.orderRepository.findOne({ where: { id: orderId, customerId } });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const saga = await this.sagaStateRepository.findOne({
      where: { order: { id: orderId }, sagaType: SagaType.Checkout },
      order: { startedAt: 'DESC' },
    });
    const payload = (saga?.payload ?? {}) as Record<string, unknown>;

    return {
      sagaStatus: saga?.status ?? null,
      orderStatus: order.status,
      paymentState: order.paymentStatus,
      redirectUrl: (payload.redirectUrl as string | undefined) ?? null,
    };
  }
}
