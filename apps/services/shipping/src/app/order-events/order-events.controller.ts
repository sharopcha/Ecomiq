import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { ShipmentsService } from '../shipments/shipments.service';
import { ORDER_PLACED_EVENT_TYPE, OrderPlacedPayload } from './order-placed-event-payload';

/**
 * Cross-namespace consumer of order's `order.events` topic — same
 * precedent as notification's `ReturnEventsController`. Only
 * `orders.order.placed` has a handler here; every other `orders.order.*`
 * event (created/updated/canceled/stage_changed/...) on the same topic is
 * automatically ack-and-ignored by `PulsarServer` itself (no
 * `@EventPattern` registered for them).
 */
@Controller()
@Public()
@SkipThrottle()
export class OrderEventsController {
  private readonly logger = new Logger(OrderEventsController.name);

  constructor(private readonly shipments: ShipmentsService) {}

  @EventPattern(ORDER_PLACED_EVENT_TYPE)
  async onOrderPlaced(
    @Payload() payload: OrderPlacedPayload,
    @Ctx() envelope: EventEnvelope<OrderPlacedPayload>,
  ): Promise<void> {
    const existing = await this.shipments.findByOrderId(envelope.storeId, payload.orderId);
    if (existing) {
      this.logger.log(
        `orders.order.placed skipped (sourceEventId=${envelope.eventId}): order ${payload.orderId} already has shipment ${existing.displayId}`,
      );
      return;
    }

    await this.shipments.create(envelope.storeId, {
      orderId: payload.orderId,
      destinationAddress: payload.shippingAddress ?? undefined,
      contactEmail: payload.contactEmail ?? undefined,
    });
  }
}
