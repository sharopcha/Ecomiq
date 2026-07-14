import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { ReservationsService } from './reservations.service';
import { InventoryEventType } from '../events/inventory-event-types';

interface ReservationExpiryCheckPayload {
  reservationId: string;
}

/**
 * The consumer half of the 24h reservation auto-expiry. No HTTP routes,
 * same shape as `CatalogSyncController`: an `@EventPattern` handler
 * dispatched by a *second* `PulsarServer` (wired in main.ts, subscribed to
 * inventory's **own** `reservation.events` topic — this service both
 * publishes and consumes its own reservation events, unlike the
 * cross-service catalog subscription).
 *
 * `@Public()` + `@SkipThrottle()` for the same reason as `CatalogSyncController`:
 * `JwtAuthGuard`/`ThrottlerGuard` are global `APP_GUARD`s that would
 * otherwise blow up on this RPC (non-HTTP) execution context.
 */
@Controller()
@Public()
@SkipThrottle()
export class ReservationExpiryController {
  constructor(private readonly reservations: ReservationsService) {}

  @EventPattern(InventoryEventType.ReservationExpiryCheck)
  async onExpiryCheck(
    @Payload() payload: ReservationExpiryCheckPayload,
    @Ctx() envelope: EventEnvelope<ReservationExpiryCheckPayload>,
  ): Promise<void> {
    await this.reservations.expire(envelope.storeId, payload.reservationId);
  }
}
