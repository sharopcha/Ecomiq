import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { SegmentSyncService } from './segment-sync.service';
import { SEGMENT_UPDATED_EVENT_TYPE, SegmentEventPayload } from './segment-event-payload';

/**
 * Cross-namespace, cross-service consumer of crm-service's `segment.events`
 * topic — dispatched by the `segment-events::marketing-service` PulsarServer
 * connection registered in `main.ts`. Same shape as catalog-service's
 * `CatalogSyncController` consuming crm's `review.events`.
 */
@Controller()
@Public()
@SkipThrottle()
export class SegmentSyncController {
  private readonly logger = new Logger(SegmentSyncController.name);

  constructor(private readonly segmentSync: SegmentSyncService) {}

  @EventPattern(SEGMENT_UPDATED_EVENT_TYPE)
  async onSegmentUpdated(
    @Payload() payload: SegmentEventPayload,
    @Ctx() envelope: EventEnvelope<SegmentEventPayload>,
  ): Promise<void> {
    this.logger.log(
      `crm.segment.updated received (eventId=${envelope.eventId}, segmentId=${payload.segmentId}, memberCount=${payload.memberCount})`,
    );
    await this.segmentSync.applySegmentUpdated(payload, envelope.occurredAt);
  }
}
