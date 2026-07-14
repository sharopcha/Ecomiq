import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { PickupsService } from './pickups.service';
import { ShippingPickupEventType } from '../events/shipping-event-types';

interface PickupReminderPayload {
  pickupId: string;
}

/**
 * Consumer half of the pickup reminder-check delayed message
 * (`PickupsService.scheduleBulk()` arms it). No HTTP routes, same shape as
 * `DelayCheckController` — dispatched by a *third* `PulsarServer` (wired in
 * main.ts, subscribed to shipping-service's own `pickup.events` topic
 * under a distinct subscription name).
 */
@Controller()
@Public()
@SkipThrottle()
export class PickupReminderController {
  constructor(private readonly pickups: PickupsService) {}

  @EventPattern(ShippingPickupEventType.PickupReminderCheck)
  async onReminderCheck(
    @Payload() payload: PickupReminderPayload,
    @Ctx() envelope: EventEnvelope<PickupReminderPayload>,
  ): Promise<void> {
    await this.pickups.handleReminderCheck(envelope.storeId, payload.pickupId);
  }
}
