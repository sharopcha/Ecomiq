import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '@temp-nx/auth';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Order, OrderStage, OrderStatus } from '../entities/order.entity';
import { OrderLine } from '../entities/order-line.entity';
import { FulfillmentRollup } from '../entities/fulfillment-rollup.entity';
import { ORDER_AGGREGATE_TYPE, OrderEventType } from '../events/order-event-types';
import { computeFulfillmentStatus } from './compute-fulfillment-status.util';
import { forwardStage } from './forward-stage.util';
import { FULFILLMENT_CREATED_EVENT_TYPE, FulfillmentCreatedPayload } from './fulfillment-created-event-payload';
import {
  SHIPMENT_ARRIVED_EVENT_TYPE,
  SHIPMENT_UPDATED_EVENT_TYPE,
  ShipmentStatusPayload,
} from './shipment-status-event-payload';

/**
 * Cross-namespace consumer of shipping-service's own `fulfillment.events`
 * and `shipment.events` topics — same shape as notification-service's
 * `ShippingEventsController` subscribing to shipping's `shipment.events`
 * for delay emails. Only the three events below have handlers; every other
 * `shipping.*` event on these topics is automatically ack-and-ignored by
 * `PulsarServer` (no `@EventPattern` registered for it).
 */
@Controller()
@Public()
@SkipThrottle()
export class ShippingEventsController {
  private readonly logger = new Logger(ShippingEventsController.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  ) {}

  @EventPattern(FULFILLMENT_CREATED_EVENT_TYPE)
  async onFulfillmentCreated(@Payload() payload: FulfillmentCreatedPayload): Promise<void> {
    await this.orderRepo.manager.transaction(async (manager) => {
      const already = await manager.findOne(FulfillmentRollup, { where: { fulfillmentId: payload.fulfillmentId } });
      if (already) {
        this.logger.log(`shipping.fulfillment.created ${payload.fulfillmentId} already applied — ack + no-op`);
        return;
      }

      for (const line of payload.lines) {
        await manager.increment(OrderLine, { id: line.orderLineId }, 'fulfilledQty', line.qty);
      }
      await manager.insert(FulfillmentRollup, { fulfillmentId: payload.fulfillmentId, orderId: payload.orderId });

      const order = await manager.findOneBy(Order, { id: payload.orderId });
      if (!order) {
        this.logger.warn(
          `shipping.fulfillment.created ${payload.fulfillmentId} references unknown order ${payload.orderId} — rollup applied to no order`,
        );
        return;
      }

      const lines = await manager.find(OrderLine, { where: { order: { id: order.id } } });
      const status = computeFulfillmentStatus(lines);
      if (status === order.fulfillmentStatus) return;

      await manager.update(Order, { id: order.id }, { fulfillmentStatus: status });
      await recordOutboxEvent(manager, {
        eventType: OrderEventType.OrderUpdated,
        storeId: order.storeId,
        aggregateType: ORDER_AGGREGATE_TYPE,
        aggregateId: order.id,
        payload: { orderId: order.id, storeId: order.storeId, fulfillmentStatus: status },
      });
    });
  }

  @EventPattern(SHIPMENT_UPDATED_EVENT_TYPE)
  async onShipmentUpdated(@Payload() payload: ShipmentStatusPayload): Promise<void> {
    // `shipping.shipment.updated` also fires on transitions this consumer
    // doesn't care about in principle, but `ShipmentEventType.ShipmentUpdated`
    // is only ever published on a transition into `in_progress` (see
    // shipping-service's `shipping-event-types.ts`) — the status check here
    // is defensive, not load-bearing.
    if (payload.status !== 'in_progress') return;
    await this.advanceStage(payload.orderId, OrderStage.Shipping, payload.displayId);
  }

  @EventPattern(SHIPMENT_ARRIVED_EVENT_TYPE)
  async onShipmentArrived(@Payload() payload: ShipmentStatusPayload): Promise<void> {
    await this.advanceStage(payload.orderId, OrderStage.Delivered, payload.displayId);
  }

  /**
   * `shipmentDisplayId` is captured here (not a dedicated handler) because
   * these are the earliest two events that carry it — `shipping.shipment.
   * updated` never fires for a `draft` shipment. Persisted independently of
   * the stage-advance no-op guard below: a late/redelivered event that
   * doesn't move the stage forward should still backfill the display id if
   * it's somehow still unset.
   */
  private async advanceStage(orderId: string, target: OrderStage, shipmentDisplayId?: string): Promise<void> {
    await this.orderRepo.manager.transaction(async (manager) => {
      const order = await manager.findOneBy(Order, { id: orderId });
      if (!order) {
        this.logger.warn(`shipping event references unknown order ${orderId} — stage advance skipped`);
        return;
      }
      // A canceled order has no stage left to advance — same guard as
      // OrdersService.advanceStage's own manual-stepper path.
      if (order.status === OrderStatus.Canceled) return;

      const next = forwardStage(order.stage, target);
      const shouldSetDisplayId = Boolean(shipmentDisplayId) && !order.shipmentDisplayId;
      if (next === order.stage && !shouldSetDisplayId) return; // already there, or a late/redelivered event trying to regress — no-op either way.

      const patch: Partial<Pick<Order, 'stage' | 'shipmentDisplayId'>> = {};
      if (next !== order.stage) patch.stage = next;
      if (shouldSetDisplayId) patch.shipmentDisplayId = shipmentDisplayId;
      await manager.update(Order, { id: order.id }, patch);

      if (next !== order.stage) {
        await recordOutboxEvent(manager, {
          eventType: OrderEventType.OrderStageChanged,
          storeId: order.storeId,
          aggregateType: ORDER_AGGREGATE_TYPE,
          aggregateId: order.id,
          payload: { orderId: order.id, storeId: order.storeId, stage: next },
        });
      }
    });
  }
}
