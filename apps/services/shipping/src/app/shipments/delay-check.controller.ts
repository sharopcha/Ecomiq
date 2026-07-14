import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { ShipmentsService } from './shipments.service';
import { ShipmentEventType } from '../events/shipping-event-types';

interface DelayCheckPayload {
  shipmentId: string;
}

/**
 * Consumer half of the delay-check delayed message
 * (`ShipmentsService.transition()` arms it). No HTTP routes, same shape as
 * order's `PaymentTimeoutController`/notification's `MessageRetryController`
 * — dispatched by a *second* `PulsarServer` (wired in main.ts, subscribed
 * to shipping-service's **own** `shipment.events` topic under a distinct
 * subscription name).
 *
 * `@Public()` + `@SkipThrottle()`: `JwtAuthGuard`/`ThrottlerGuard` are
 * global `APP_GUARD`s that would otherwise reject this RPC (non-HTTP)
 * execution context.
 */
@Controller()
@Public()
@SkipThrottle()
export class DelayCheckController {
  constructor(private readonly shipments: ShipmentsService) {}

  @EventPattern(ShipmentEventType.ShipmentDelayCheck)
  async onDelayCheck(
    @Payload() payload: DelayCheckPayload,
    @Ctx() envelope: EventEnvelope<DelayCheckPayload>,
  ): Promise<void> {
    await this.shipments.handleDelayCheck(envelope.storeId, payload.shipmentId);
  }
}
