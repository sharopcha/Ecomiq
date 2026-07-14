import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { CampaignsService } from './campaigns.service';
import { MarketingEventType } from '../events/marketing-event-types';

interface CampaignFirePayload {
  campaignId: string;
  scheduleAt: string;
}

/**
 * The consumer half of the campaign-fire delayed message. No HTTP routes,
 * same shape as order-service's `ReturnExpiryController`: an
 * `@EventPattern` handler dispatched by a *second* `PulsarServer` (wired
 * in main.ts, subscribed to marketing-service's **own** `campaign.events`
 * topic — a different aggregate stream than the `orders`-namespace
 * consumer already in this same service).
 *
 * `@Public()` + `@SkipThrottle()` for the same reason as every other
 * Pulsar-facing controller in this repo: `JwtAuthGuard`/`ThrottlerGuard`
 * are global `APP_GUARD`s that would otherwise reject this non-HTTP
 * execution context.
 */
@Controller()
@Public()
@SkipThrottle()
export class CampaignFireController {
  constructor(private readonly campaigns: CampaignsService) {}

  @EventPattern(MarketingEventType.CampaignFire)
  async onFire(
    @Payload() payload: CampaignFirePayload,
    @Ctx() envelope: EventEnvelope<CampaignFirePayload>,
  ): Promise<void> {
    await this.campaigns.fire(envelope.storeId, payload.campaignId, new Date(payload.scheduleAt));
  }
}
