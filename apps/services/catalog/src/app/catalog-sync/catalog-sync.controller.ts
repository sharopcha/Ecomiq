import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { CatalogSyncService } from './catalog-sync.service';
import {
  REVIEW_ARCHIVED_EVENT_TYPE,
  REVIEW_PUBLISHED_EVENT_TYPE,
  ReviewEventPayload,
} from './review-event-payload';

/**
 * Cross-namespace, cross-service consumer of crm-service's `review.events`
 * topic — catalog-service's first Pulsar *consumer* connection (it has only
 * ever been a producer until now). Same precedent as shipping's/crm's own
 * `orders.order.placed` subscriptions: one subscription, one handler per
 * event type that matters (`crm.review.created` is ack-and-ignored by
 * `PulsarServer` itself — no `@EventPattern` registered for it).
 */
@Controller()
@Public()
@SkipThrottle()
export class CatalogSyncController {
  private readonly logger = new Logger(CatalogSyncController.name);

  constructor(private readonly catalogSync: CatalogSyncService) {}

  @EventPattern(REVIEW_PUBLISHED_EVENT_TYPE)
  async onReviewPublished(
    @Payload() payload: ReviewEventPayload,
    @Ctx() envelope: EventEnvelope<ReviewEventPayload>,
  ): Promise<void> {
    this.logger.log(`crm.review.published received (eventId=${envelope.eventId}, reviewId=${payload.id})`);
    await this.catalogSync.applyReviewPublished(envelope.storeId, envelope.eventId, payload);
  }

  @EventPattern(REVIEW_ARCHIVED_EVENT_TYPE)
  async onReviewArchived(
    @Payload() payload: ReviewEventPayload,
    @Ctx() envelope: EventEnvelope<ReviewEventPayload>,
  ): Promise<void> {
    this.logger.log(`crm.review.archived received (eventId=${envelope.eventId}, reviewId=${payload.id})`);
    await this.catalogSync.applyReviewArchived(envelope.storeId, envelope.eventId, payload);
  }
}
