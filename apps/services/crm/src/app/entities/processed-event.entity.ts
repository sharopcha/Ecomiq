import { Column, Entity } from 'typeorm';

/**
 * Idempotency ledger keyed on `(event_id, handler)`, not `event_id` alone —
 * one Pulsar subscription's `orders.order.placed` handler method calls
 * multiple independent business-logic functions (rollup, loyalty accrual,
 * referral completion), each of which must be able to claim the *same*
 * event independently. A single `event_id`-only claim would let the first
 * handler "use up" the event and silently skip the rest.
 *
 * Reused by every handler this one subscription grows (loyalty accrual,
 * referral completion) — rollup increments aren't naturally replay-safe the
 * way an exists-check is (shipping's auto-draft precedent: skip if a
 * shipment already exists for the order), so a real dedup ledger is needed
 * here.
 */
@Entity('processed_event')
export class ProcessedEvent {
  @Column({ type: 'text', name: 'event_id', primary: true })
  eventId!: string;

  @Column({ type: 'text', primary: true })
  handler!: string;

  @Column({ type: 'timestamptz', name: 'processed_at', default: () => 'now()' })
  processedAt!: Date;
}
