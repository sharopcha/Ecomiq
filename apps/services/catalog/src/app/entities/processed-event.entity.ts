import { Column, Entity } from 'typeorm';

/**
 * Idempotency ledger for cross-service Pulsar consumers, keyed on
 * `(event_id, handler)` — catalog's own local copy of crm-service's
 * `processed_event` table (duplicated per-service by design, same as this
 * repo's `NOTIFY_SEND_COMMAND` string constant). `crm.review.published`/
 * `crm.review.archived` increments/decrements aren't naturally replay-safe
 * (no exists-check shortcut like shipping's auto-draft has), so a real
 * dedup ledger is needed here too.
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
