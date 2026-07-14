import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PaginatedResult, assertOwnedByStore, paginate } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderLine } from '../entities/order-line.entity';
import { OrderTag } from '../entities/order-tag.entity';
import { writeActivityLog } from '../common/activity-log.util';
import { claimNextSequenceNumber } from '../common/store-sequence.util';
import { ORDER_AGGREGATE_TYPE, OrderEventType } from '../events/order-event-types';
import { computeOrderTotals } from './compute-order-totals.util';
import { nextStage } from './next-stage.util';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { FindOrdersQueryDto } from './dto/find-orders-query.dto';

const ORDER_SEQUENCE_KIND = 'order';
const SUBJECT_TABLE = 'order';

/**
 * `create()`/`update()`/`cancel()`/`advanceStage()`/`setNote()`/`addTag()`/
 * `removeTag()` are the only places an order's persisted state moves — every
 * one of them writes an `activity_log` row and (except `update`/tag/note,
 * which are plain edits, not lifecycle transitions the saga or other
 * services need to react to) an outbox event on `orders/order.events`.
 * `create()` here always emits `OrderCreated`, never `OrderPlaced` — see
 * `order-event-types.ts`'s doc comment for why that distinction matters
 * to the marketing and inventory consumers.
 */
@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly repo: Repository<Order>,
    @InjectRepository(OrderTag) private readonly tagRepo: Repository<OrderTag>,
    @InjectRepository(OrderLine) private readonly orderLineRepo: Repository<OrderLine>,
  ) {}

  async create(storeId: string, dto: CreateOrderDto): Promise<Order> {
    const status = dto.status ?? OrderStatus.Open;
    if (status !== OrderStatus.Draft && status !== OrderStatus.Open) {
      throw new BadRequestException('status must be draft or open on creation');
    }

    return this.repo.manager.transaction(async (manager) => {
      const displayNumber = await claimNextSequenceNumber(manager, storeId, ORDER_SEQUENCE_KIND);

      const shippingFeeMinor = dto.shippingFeeMinor ?? 0;
      const taxMinor = dto.taxMinor ?? 0;
      const { subtotalMinor, totalMinor } = computeOrderTotals({
        lines: dto.lines,
        shippingFeeMinor,
        taxMinor,
        discountMinor: 0, // manual/draft creation never applies a discount — that's the checkout saga's job.
      });

      const order = manager.create(Order, {
        storeId,
        displayNumber,
        status,
        customerId: dto.customerId ?? null,
        channelId: dto.channelId ?? null,
        channelType: dto.channelType,
        subtotalMinor,
        shippingFeeMinor,
        discountMinor: 0,
        taxMinor,
        totalMinor,
        currency: dto.currency ?? 'USD',
        shippingAddress: dto.shippingAddress ?? null,
        contactEmail: dto.contactEmail ?? null,
        contactPhone: dto.contactPhone ?? null,
      });
      const saved = await manager.save(order);

      const lines = dto.lines.map((line) =>
        manager.create(OrderLine, {
          order: saved,
          variantId: line.variantId,
          name: line.name,
          sku: line.sku ?? null,
          variantLabel: line.variantLabel ?? null,
          qty: line.qty,
          unitPriceMinor: line.unitPriceMinor,
          imageFileId: line.imageFileId ?? null,
        }),
      );
      await manager.save(lines);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'order.created',
        data: { status: saved.status, displayNumber: saved.displayNumber },
      });
      await recordOutboxEvent(manager, {
        eventType: OrderEventType.OrderCreated,
        storeId,
        aggregateType: ORDER_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  async update(storeId: string, id: string, dto: UpdateOrderDto): Promise<Order> {
    const order = await this.findOne(storeId, id);
    if (order.status !== OrderStatus.Draft && order.status !== OrderStatus.Open) {
      throw new ConflictException(`Order ${id} can only be updated while draft or open (current: ${order.status})`);
    }

    Object.assign(order, dto);

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(order);
      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'order.updated',
        data: dto as Record<string, unknown>,
      });
      await recordOutboxEvent(manager, {
        eventType: OrderEventType.OrderUpdated,
        storeId,
        aggregateType: ORDER_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      return saved;
    });
  }

  /** Draft -> open, the one status transition that isn't a generic field edit — a draft cart becoming a real order once the merchant is ready to act on it. */
  async confirm(storeId: string, id: string): Promise<Order> {
    const order = await this.findOne(storeId, id);
    if (order.status !== OrderStatus.Draft) {
      throw new ConflictException(`Order ${id} can only be confirmed from draft (current: ${order.status})`);
    }
    order.status = OrderStatus.Open;

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(order);
      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'order.confirmed',
        data: { status: saved.status },
      });
      await recordOutboxEvent(manager, {
        eventType: OrderEventType.OrderUpdated,
        storeId,
        aggregateType: ORDER_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      return saved;
    });
  }

  /** Forbidden once `completed`; already-`canceled` is a real conflict, not a silent no-op — a stale UI double-click on Cancel should surface, not be swallowed. */
  async cancel(storeId: string, id: string, reason?: string): Promise<Order> {
    const order = await this.findOne(storeId, id);
    if (order.status === OrderStatus.Completed) {
      throw new ConflictException(`Order ${id} is completed and can no longer be canceled`);
    }
    if (order.status === OrderStatus.Canceled) {
      throw new ConflictException(`Order ${id} is already canceled`);
    }

    order.status = OrderStatus.Canceled;
    order.canceledAt = new Date();
    order.cancelReason = reason ?? null;

    // Fetched before the order-cancel event fires so the inventory
    // consumer can release any still-active reservations for this order —
    // a manual cancel here can still be reachable on a `paid` order that
    // never went through the saga's own compensation (which already
    // releases everything itself), so this is the defensive path, not the
    // primary one.
    const lines = await this.orderLineRepo.find({ where: { order: { id: order.id } } });

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(order);
      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'order.canceled',
        data: { reason: saved.cancelReason },
      });
      await recordOutboxEvent(manager, {
        eventType: OrderEventType.OrderCanceled,
        storeId,
        aggregateType: ORDER_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: {
          ...this.toEventPayload(saved),
          lines: lines.map((line) => ({
            orderLineId: line.id,
            variantId: line.variantId,
            reservationId: line.reservationId ?? null,
          })),
        },
      });
      return saved;
    });
  }

  /** One step forward on the 4-step stepper (`next-stage.util.ts`) — refuses on a canceled order and at the final stage. */
  async advanceStage(storeId: string, id: string): Promise<Order> {
    const order = await this.findOne(storeId, id);
    if (order.status === OrderStatus.Canceled) {
      throw new ConflictException(`Order ${id} is canceled and has no stage to advance`);
    }

    const result = nextStage(order.stage);
    if (result.ok === false) {
      throw new ConflictException(`Order ${id} is already at its final stage`);
    }

    order.stage = result.stage;

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(order);
      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'order.stage_changed',
        data: { stage: saved.stage },
      });
      await recordOutboxEvent(manager, {
        eventType: OrderEventType.OrderStageChanged,
        storeId,
        aggregateType: ORDER_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      return saved;
    });
  }

  async setNote(storeId: string, id: string, note?: string): Promise<Order> {
    const order = await this.findOne(storeId, id);
    order.note = note && note.length > 0 ? note : null;
    return this.repo.save(order);
  }

  async addTag(storeId: string, id: string, tagId: string): Promise<void> {
    const order = await this.findOne(storeId, id);
    const existing = await this.tagRepo.findOneBy({ orderId: order.id, tagId });
    if (existing) return; // idempotent — re-adding an already-present tag is a silent no-op.
    await this.tagRepo.save(this.tagRepo.create({ order, tagId }));
  }

  async removeTag(storeId: string, id: string, tagId: string): Promise<void> {
    const order = await this.findOne(storeId, id);
    await this.tagRepo.delete({ orderId: order.id, tagId });
  }

  async findOne(storeId: string, id: string): Promise<Order> {
    const entity = await this.repo.findOneBy({ id });
    return assertOwnedByStore(entity, storeId, () => new NotFoundException(`Order ${id} not found`));
  }

  async list(storeId: string, query: FindOrdersQueryDto): Promise<PaginatedResult<Order>> {
    const qb = this.repo.createQueryBuilder('o').where('o.store_id = :storeId', { storeId });

    if (query.status) qb.andWhere('o.status = :status', { status: query.status });
    if (query.paymentStatus) qb.andWhere('o.payment_status = :paymentStatus', { paymentStatus: query.paymentStatus });
    if (query.fulfillmentStatus) {
      qb.andWhere('o.fulfillment_status = :fulfillmentStatus', { fulfillmentStatus: query.fulfillmentStatus });
    }
    if (query.dateFrom) qb.andWhere('o.order_date >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('o.order_date <= :dateTo', { dateTo: query.dateTo });
    if (query.customerId) qb.andWhere('o.customer_id = :customerId', { customerId: query.customerId });

    return paginate(qb, 'o', query);
  }

  /** Exposed for InvoicesService's `POST /:id/invoice` so it can snapshot totals without a second store-ownership round trip via a raw repo call. */
  async findOneWithManager(manager: EntityManager, storeId: string, id: string): Promise<Order> {
    const entity = await manager.findOneBy(Order, { id });
    return assertOwnedByStore(entity, storeId, () => new NotFoundException(`Order ${id} not found`));
  }

  private toEventPayload(order: Order): Record<string, unknown> {
    return {
      orderId: order.id,
      storeId: order.storeId,
      displayNumber: order.displayNumber,
      customerId: order.customerId,
      // Absent on every order until the checkout saga validates a discount
      // code — `?? null` here (not just `order.discountId`) is what lets
      // the marketing consumer distinguish "no discount to release" from a
      // field that simply wasn't in the payload. Real gap found while
      // wiring the cancel payload: this generic payload never carried
      // discountId at all before, so a manually-canceled
      // *paid* order (checkout succeeded, then canceled afterward — status
      // stays `open` through payment, only `completed`/`canceled` end the
      // order) with a discount applied would silently never release its
      // discount usage.
      discountId: order.discountId ?? null,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      stage: order.stage,
      subtotalMinor: order.subtotalMinor,
      shippingFeeMinor: order.shippingFeeMinor,
      discountMinor: order.discountMinor,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
      currency: order.currency,
    };
  }
}
