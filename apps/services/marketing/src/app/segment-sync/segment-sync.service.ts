import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SegmentSnapshot } from '../entities/segment-snapshot.entity';
import { SegmentEventPayload } from './segment-event-payload';

/**
 * Consumes crm-service's `crm.segment.updated` — the only writer of
 * `segment_snapshot`. Idempotent by segment id + event time: a raw-SQL
 * upsert keyed on `id` (crm's own segment id, not a locally generated one)
 * whose `WHERE` clause rejects the write if the existing row's
 * `event_time` is already >= the incoming envelope's `occurredAt`. This
 * covers both a redelivery of the same event (equal timestamps — the
 * write reapplies identical values, a true no-op) and out-of-order
 * delivery (an older event arriving after a newer one is silently
 * dropped) without needing a separate processed-event ledger, since
 * `segment_snapshot` is itself keyed on the natural id.
 */
@Injectable()
export class SegmentSyncService {
  private readonly logger = new Logger(SegmentSyncService.name);

  constructor(
    @InjectRepository(SegmentSnapshot) private readonly repo: Repository<SegmentSnapshot>,
  ) {}

  async applySegmentUpdated(payload: SegmentEventPayload, occurredAt: string): Promise<void> {
    const eventTime = new Date(occurredAt);
    const result = await this.repo.manager.query(
      `INSERT INTO segment_snapshot (id, store_id, name, member_count, member_emails, event_time, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         member_count = EXCLUDED.member_count,
         member_emails = EXCLUDED.member_emails,
         event_time = EXCLUDED.event_time,
         updated_at = now()
       WHERE segment_snapshot.event_time <= EXCLUDED.event_time
       RETURNING id`,
      [
        payload.segmentId,
        payload.storeId,
        payload.name,
        payload.memberCount,
        JSON.stringify(payload.memberEmails),
        eventTime,
      ],
    );

    if (result.length === 0) {
      this.logger.log(
        `crm.segment.updated skipped for segment ${payload.segmentId}: incoming event_time ${occurredAt} is not newer than the stored snapshot`,
      );
    }
  }
}
