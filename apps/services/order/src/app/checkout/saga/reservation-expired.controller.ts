import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { CheckoutSagaOrchestrator } from './checkout-saga.orchestrator';

/**
 * Local mirror of inventory-service's `inventory.reservation.expired`
 * payload (`ReservationsService.toEventPayload`) — only the field this
 * consumer reads.
 */
interface ReservationExpiredPayload {
  reservationId: string;
  orderId: string;
}

/**
 * The 24h reservation hold outlasting the ~30-minute checkout payment
 * window shouldn't normally happen, but a crashed saga must not leak a
 * paid-but-unreserved order: if a reservation
 * expires while its order's checkout saga is still genuinely
 * `awaiting_payment`, this compensates it exactly like a real payment
 * failure would (cancel the intent, release every reservation, cancel the
 * order) — reuses `handlePaymentFailed` directly rather than a parallel
 * method, since the "find the awaiting_payment saga for this order and
 * compensate it" logic is identical either way.
 *
 * Dispatched by the `reservation-expired::order-service` `PulsarServer`
 * subscription on inventory-service's own `inventory` namespace (main.ts).
 */
@Controller()
@Public()
@SkipThrottle()
export class ReservationExpiredController {
  constructor(private readonly orchestrator: CheckoutSagaOrchestrator) {}

  @EventPattern('inventory.reservation.expired')
  async onReservationExpired(
    @Payload() payload: ReservationExpiredPayload,
    @Ctx() _envelope: EventEnvelope<ReservationExpiredPayload>,
  ): Promise<void> {
    await this.orchestrator.handlePaymentFailed(
      payload.orderId,
      `inventory reservation ${payload.reservationId} expired before payment completed`,
    );
  }
}
