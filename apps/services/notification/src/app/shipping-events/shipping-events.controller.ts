import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { DispatchService } from '../dispatch/dispatch.service';
import { mapShipmentDelayed } from './map-shipment-delayed.util';
import { SHIPMENT_DELAYED_EVENT_TYPE, ShipmentDelayedPayload } from './shipment-delayed-event-payload';

/**
 * Cross-namespace consumer of shipping's `shipment.events` topic — same
 * precedent as `ReturnEventsController`. Only `shipping.shipment.delayed`
 * has a handler here; every other `shipping.shipment.*` event
 * (created/updated/arrived/canceled) and shipping's own self-consumed
 * `shipping.shipment.delay_check` on the same topic are automatically
 * ack-and-ignored by `PulsarServer` itself (no `@EventPattern` registered
 * for them).
 */
@Controller()
@Public()
@SkipThrottle()
export class ShippingEventsController {
  private readonly logger = new Logger(ShippingEventsController.name);

  constructor(private readonly dispatch: DispatchService) {}

  @EventPattern(SHIPMENT_DELAYED_EVENT_TYPE)
  async onShipmentDelayed(
    @Payload() payload: ShipmentDelayedPayload,
    @Ctx() envelope: EventEnvelope<ShipmentDelayedPayload>,
  ): Promise<void> {
    const mapped = mapShipmentDelayed(payload);
    if (mapped.action === 'skip') {
      this.logger.log(`shipping.shipment.delayed skipped (sourceEventId=${envelope.eventId}): ${mapped.reason}`);
      return;
    }

    await this.dispatch.dispatch({
      storeId: envelope.storeId,
      sourceEventId: envelope.eventId,
      ...mapped.input,
    });
  }
}
