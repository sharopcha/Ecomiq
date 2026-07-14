import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { OrderSyncService } from './order-sync.service';
import { OrderCanceledPayload, OrderEvent, OrderPlacedPayload } from './order-event-payloads';

/**
 * Pulsar-facing side of the discount usage consumer. No HTTP routes —
 * dispatched by the `PulsarServer` microservice connection in `main.ts`
 * (subscribed to order-service's `order.events` topic, namespace
 * `orders`), same pattern as inventory's `CatalogSyncController`.
 *
 * `@Payload()`/`@Ctx()` are required, not decorative — repo rule
 * (`catalog-sync.controller.ts`'s doc comment has the full "arrives as
 * undefined" story). `@Public()` + `@SkipThrottle()`: same non-HTTP
 * execution-context bypass every other Pulsar-facing controller in this
 * repo needs.
 *
 * Independent of order-service's actual implementation — this consumer
 * needs **zero changes** as long as the real producer (the checkout
 * saga) honors `order-event-payloads.ts`'s contract; the demo scripts
 * and smoke tests publish synthetic envelopes shaped the same way.
 */
@Controller()
@Public()
@SkipThrottle()
export class OrderEventsController {
  constructor(private readonly orderSync: OrderSyncService) {}

  @EventPattern(OrderEvent.Placed)
  async onOrderPlaced(
    @Payload() payload: OrderPlacedPayload,
    @Ctx() envelope: EventEnvelope<OrderPlacedPayload>,
  ): Promise<void> {
    await this.orderSync.recordUsage(envelope.storeId, payload);
  }

  @EventPattern(OrderEvent.Canceled)
  async onOrderCanceled(
    @Payload() payload: OrderCanceledPayload,
    @Ctx() envelope: EventEnvelope<OrderCanceledPayload>,
  ): Promise<void> {
    await this.orderSync.releaseUsage(envelope.storeId, payload);
  }
}
