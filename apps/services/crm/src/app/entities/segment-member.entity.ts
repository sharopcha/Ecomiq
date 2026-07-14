import { Column, Entity, Index } from 'typeorm';

/**
 * Pure materialization table — composite PK, no separate id column, same
 * shape as `StoreSequence`/`ProcessedEvent`. Fully replaced on every
 * `evaluate()` call (delete-all-then-insert-matching), not incrementally
 * maintained — there's no live trigger keeping this in sync with customer
 * writes, by design (manual evaluate only, per the plan's own note about
 * automation-service owning scheduled re-evaluation later).
 */
@Entity('segment_member')
export class SegmentMember {
  @Column({ type: 'text', name: 'segment_id', primary: true })
  segmentId!: string;

  @Index()
  @Column({ type: 'text', name: 'customer_id', primary: true })
  customerId!: string;
}
