import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { OrderSyncService } from './order-sync.service';
import { OrderCanceledPayload, OrderEvent, OrderPlacedPayload } from './order-event-payloads';

/**
 * Pulsar-facing side of the order-events consumer — dispatched by the
 * `order-events::inventory-service` `PulsarServer` subscription wired in
 * main.ts (order-service's own `orders` namespace).
 * Same `@Payload()`/`@Ctx()`-required, `@Public()`/`@SkipThrottle()` shape
 * as `CatalogSyncController` — see its doc comment for the full rationale.
 */
@Controller()
@Public()
@SkipThrottle()
export class OrderSyncController {
  constructor(private readonly sync: OrderSyncService) {}

  @EventPattern(OrderEvent.Placed)
  async onOrderPlaced(
    @Payload() payload: OrderPlacedPayload,
    @Ctx() envelope: EventEnvelope<OrderPlacedPayload>,
  ): Promise<void> {
    await this.sync.commitOrder(envelope.storeId, payload);
  }

  @EventPattern(OrderEvent.Canceled)
  async onOrderCanceled(
    @Payload() payload: OrderCanceledPayload,
    @Ctx() envelope: EventEnvelope<OrderCanceledPayload>,
  ): Promise<void> {
    await this.sync.releaseOrder(envelope.storeId, payload);
  }
}
