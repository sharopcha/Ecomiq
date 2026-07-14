import { Injectable } from '@nestjs/common';
import { ReservationsService } from '../reservations/reservations.service';
import { OrderCanceledPayload, OrderPlacedPayload } from './order-event-payloads';

/**
 * An additive consumer of order-service's own events — zero changes to
 * existing reservation/stock logic beyond the one sanctioned
 * `ReservationsService.commit()` extension.
 */
@Injectable()
export class OrderSyncService {
  constructor(private readonly reservations: ReservationsService) {}

  /** `orders.order.placed` — commits every line's reservation (release the hold, decrement on_hand for real). Lines with no `reservationId` are skipped, not errored — shouldn't happen once checkout has actually succeeded, but a malformed/partial event must not crash this consumer. */
  async commitOrder(storeId: string, payload: OrderPlacedPayload): Promise<void> {
    for (const line of payload.lines) {
      if (!line.reservationId) continue;
      await this.reservations.commit(storeId, line.reservationId);
    }
  }

  /** `orders.order.canceled` — releases any still-active reservation for each line. Idempotent no-op on lines already released by the saga's own compensation — this is the defensive backstop, not the primary release path. */
  async releaseOrder(storeId: string, payload: OrderCanceledPayload): Promise<void> {
    for (const line of payload.lines ?? []) {
      if (!line.reservationId) continue;
      await this.reservations.releaseIdempotent(storeId, line.reservationId);
    }
  }
}
