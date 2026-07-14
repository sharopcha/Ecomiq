import { Column, Entity } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

/**
 * Thin read-side copy of a crm-service segment, kept up to date by
 * `SegmentSyncService` reacting to `crm.segment.updated`. `id` is the
 * segment's own id (crm's PK), not a locally generated ULID — this is a
 * projection, not an independent aggregate, so there is no
 * `@BeforeInsert` id generation in play here; every write sets `id`
 * explicitly from the event payload.
 *
 * `eventTime` is `envelope.occurredAt`, kept purely so a stale/out-of-order
 * redelivery can be rejected (see `segment-sync.service.ts`'s upsert) —
 * it is not meant to be read by campaign send-time resolution.
 */
@Entity('segment_snapshot')
export class SegmentSnapshot extends TenantScopedEntity {
  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'int', name: 'member_count', default: 0 })
  memberCount!: number;

  @Column({ type: 'jsonb', name: 'member_emails' })
  memberEmails!: string[];

  @Column({ type: 'timestamptz', name: 'event_time' })
  eventTime!: Date;
}
