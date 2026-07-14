import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TenantScopedCrudService } from '@temp-nx/typeorm';
import { recordOutboxEvent, topicForCommands } from '@temp-nx/pulsar';
import { Campaign, CampaignStatus } from '../entities/campaign.entity';
import { CampaignSend } from '../entities/campaign-send.entity';
import { SegmentSnapshot } from '../entities/segment-snapshot.entity';
import { CAMPAIGN_AGGREGATE_TYPE, MarketingEventType } from '../events/marketing-event-types';
import { assertPauseCampaign, assertScheduleCampaign } from './campaign-transitions.util';
import { assertCampaignFire } from './campaign-fire-guard.util';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { ScheduleCampaignDto } from './dto/schedule-campaign.dto';
import { CampaignSendEventKind } from './dto/record-send-event.dto';

/** The `notify.send` command contract (§0 gaps: notification-service doesn't exist yet — payload-only, verified by `marketing:notify-tail`). Same contract order-service's refund settlement uses. */
const NOTIFY_SEND_COMMAND = 'notify.send';

interface CampaignAudience {
  emails?: string[];
}

interface CampaignStats {
  totalRecipients?: number;
  sent?: number;
  opened?: number;
  clicked?: number;
  bounced?: number;
}

const SEND_EVENT_FIELD: Record<CampaignSendEventKind, 'openedAt' | 'clickedAt' | 'bouncedAt'> = {
  [CampaignSendEventKind.Opened]: 'openedAt',
  [CampaignSendEventKind.Clicked]: 'clickedAt',
  [CampaignSendEventKind.Bounced]: 'bouncedAt',
};

@Injectable()
export class CampaignsService extends TenantScopedCrudService<Campaign> {
  protected readonly alias = 'campaign';

  constructor(
    @InjectRepository(Campaign) repo: Repository<Campaign>,
    @InjectRepository(CampaignSend) private readonly sendRepo: Repository<CampaignSend>,
    @InjectRepository(SegmentSnapshot) private readonly segmentSnapshotRepo: Repository<SegmentSnapshot>,
    private readonly config: ConfigService,
  ) {
    super(repo);
  }

  override async create(storeId: string, dto: CreateCampaignDto): Promise<Campaign> {
    const campaign = this.repo.create({ ...dto, storeId });
    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(campaign);
      await recordOutboxEvent(manager, {
        eventType: MarketingEventType.CampaignCreated,
        storeId,
        aggregateType: CAMPAIGN_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      return saved;
    });
  }

  override async update(storeId: string, id: string, dto: UpdateCampaignDto): Promise<Campaign> {
    const campaign = await this.findOne(storeId, id);
    Object.assign(campaign, dto);

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(campaign);
      await recordOutboxEvent(manager, {
        eventType: MarketingEventType.CampaignUpdated,
        storeId,
        aggregateType: CAMPAIGN_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      return saved;
    });
  }

  /**
   * Arms (or re-arms) a campaign for sending
   * (`assertScheduleCampaign`) and produces the self-addressed delayed
   * `marketing.campaign.fire` message (`deliverAt = scheduleAt`) that
   * `CampaignFireController` picks up when it actually arrives. Calling
   * this again on an already-`scheduled` campaign is a genuine reschedule:
   * a brand-new delayed message is armed with the new time, and the old
   * one is left to arrive later — `assertCampaignFire`'s reschedule guard
   * is what makes that stale arrival a safe no-op (Pulsar can't cancel a
   * delayed message once produced).
   */
  async schedule(storeId: string, id: string, dto: ScheduleCampaignDto): Promise<Campaign> {
    const campaign = await this.findOne(storeId, id);
    const scheduleAt = new Date(dto.scheduleAt);
    const result = assertScheduleCampaign(campaign.status, scheduleAt, new Date());
    if (result.ok === false) {
      if (result.reason === 'NOT_SCHEDULABLE') {
        throw new ConflictException(
          `Campaign ${id} cannot be scheduled from status ${campaign.status}`,
        );
      }
      throw new BadRequestException('scheduleAt must be in the future');
    }

    campaign.status = CampaignStatus.Scheduled;
    campaign.scheduleAt = scheduleAt;

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(campaign);
      await recordOutboxEvent(manager, {
        eventType: MarketingEventType.CampaignScheduled,
        storeId,
        aggregateType: CAMPAIGN_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      await recordOutboxEvent(manager, {
        eventType: MarketingEventType.CampaignFire,
        storeId,
        aggregateType: CAMPAIGN_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: { campaignId: saved.id, scheduleAt: scheduleAt.toISOString() },
        deliverAt: scheduleAt,
      });
      return saved;
    });
  }

  /** Only legal while still armed (`scheduled`) — see `assertPauseCampaign`'s doc comment. */
  async pause(storeId: string, id: string): Promise<Campaign> {
    const campaign = await this.findOne(storeId, id);
    const result = assertPauseCampaign(campaign.status);
    if (result.ok === false) {
      throw new ConflictException(`Campaign ${id} cannot be paused from status ${campaign.status}`);
    }

    campaign.status = CampaignStatus.Paused;

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(campaign);
      await recordOutboxEvent(manager, {
        eventType: MarketingEventType.CampaignPaused,
        storeId,
        aggregateType: CAMPAIGN_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      return saved;
    });
  }

  /** Terminal and idempotent — same convention as `DiscountsService.archive()`. */
  async archive(storeId: string, id: string): Promise<Campaign> {
    const campaign = await this.findOne(storeId, id);
    if (campaign.status === CampaignStatus.Archived) {
      return campaign;
    }

    campaign.status = CampaignStatus.Archived;

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(campaign);
      await recordOutboxEvent(manager, {
        eventType: MarketingEventType.CampaignArchived,
        storeId,
        aggregateType: CAMPAIGN_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      return saved;
    });
  }

  /**
   * Invoked by `CampaignFireController` when the delayed
   * `marketing.campaign.fire` message arrives. Idempotent and
   * side-effect-free unless `assertCampaignFire` says this exact arming is
   * still live — silent no-op on a missing campaign (wrong store), a
   * paused/already-fired campaign, or a stale reschedule, same
   * "terminal-state check, not an event-id ledger" idempotency convention
   * as `ReturnsService.expire()`.
   *
   * Expands the resolved recipient list (`resolveRecipients` — a
   * `segmentId`'s snapshot if set and present, else `audience.emails`)
   * into `campaign_send` rows (batch insert), emits one `notify.send`
   * command per recipient onto `marketing/notify.commands` (an explicit
   * outbox `topic` override — the default aggregate-derived topic would
   * be `marketing/campaign.events`, not the command topic), then marks
   * `sent` with `stats` populated.
   */
  async fire(storeId: string, campaignId: string, armedScheduleAt: Date): Promise<void> {
    const campaign = await this.repo.findOneBy({ id: campaignId });
    if (!campaign || campaign.storeId !== storeId) return;

    const guard = assertCampaignFire(campaign.status, campaign.scheduleAt, armedScheduleAt, new Date());
    if (guard.ok === false) return;

    const emails = await this.resolveRecipients(storeId, campaign);
    const tenant = this.config.get<string>('PULSAR_TENANT', 'ecomiq');

    await this.repo.manager.transaction(async (manager) => {
      campaign.status = CampaignStatus.Sending;
      await manager.save(campaign);

      const sendEntities = emails.map((recipient) =>
        manager.create(CampaignSend, { storeId, campaign, recipient, sentAt: new Date() }),
      );
      const savedSends = await manager.save(sendEntities);

      for (const send of savedSends) {
        await recordOutboxEvent(manager, {
          eventType: NOTIFY_SEND_COMMAND,
          storeId,
          aggregateType: CAMPAIGN_AGGREGATE_TYPE,
          aggregateId: campaign.id,
          payload: {
            template: 'campaign',
            campaignId: campaign.id,
            sendId: send.id,
            recipient: send.recipient,
            content: campaign.contentRef ?? null,
          },
          topic: topicForCommands(tenant, 'marketing', 'notify'),
        });
      }

      campaign.status = CampaignStatus.Sent;
      campaign.stats = {
        ...(campaign.stats as CampaignStats | null),
        totalRecipients: savedSends.length,
        sent: savedSends.length,
      };
      const savedCampaign = await manager.save(campaign);
      await recordOutboxEvent(manager, {
        eventType: MarketingEventType.CampaignSent,
        storeId,
        aggregateType: CAMPAIGN_AGGREGATE_TYPE,
        aggregateId: savedCampaign.id,
        payload: this.toEventPayload(savedCampaign),
      });
    });
  }

  /**
   * Engagement write-back — the future notification-service/webhook
   * caller; REST for now so stats are demonstrable. Idempotent
   * counting: `stats[kind]` only increments the first time a given send
   * transitions into that kind (a retried webhook re-setting an
   * already-set timestamp does not double-count).
   */
  async recordSendEvent(
    storeId: string,
    campaignId: string,
    sendId: string,
    kind: CampaignSendEventKind,
  ): Promise<CampaignSend> {
    const send = await this.sendRepo.findOne({ where: { id: sendId }, relations: { campaign: true } });
    if (!send || send.storeId !== storeId || send.campaign.id !== campaignId) {
      throw new NotFoundException(`Campaign send ${sendId} not found`);
    }

    const field = SEND_EVENT_FIELD[kind];
    const alreadyRecorded = send[field] != null;
    send[field] = new Date();

    return this.repo.manager.transaction(async (manager) => {
      const savedSend = await manager.save(send);
      if (!alreadyRecorded) {
        const campaign = send.campaign;
        const stats = { ...(campaign.stats as CampaignStats | null) };
        stats[kind] = (stats[kind] ?? 0) + 1;
        campaign.stats = stats;
        await manager.save(campaign);
      }
      return savedSend;
    });
  }

  /**
   * `segmentId`'s snapshot wins when set and present; `audience.emails`
   * is the fallback (unset `segmentId`, or a segment that hasn't been
   * evaluated in crm-service yet so no snapshot has arrived). The loose
   * email list is never merged with a segment — one or the other, same
   * "additive, not simultaneous" scope as the plan step that added this.
   */
  private async resolveRecipients(storeId: string, campaign: Campaign): Promise<string[]> {
    if (campaign.segmentId) {
      const snapshot = await this.segmentSnapshotRepo.findOne({
        where: { id: campaign.segmentId, storeId },
      });
      if (snapshot) {
        return snapshot.memberEmails;
      }
    }
    return this.extractAudienceEmails(campaign);
  }

  private extractAudienceEmails(campaign: Campaign): string[] {
    const audience = campaign.audience as CampaignAudience | null;
    return Array.isArray(audience?.emails) ? (audience?.emails as string[]) : [];
  }

  private toEventPayload(campaign: Campaign): Record<string, unknown> {
    return {
      campaignId: campaign.id,
      storeId: campaign.storeId,
      kind: campaign.kind,
      title: campaign.title,
      status: campaign.status,
      scheduleAt: campaign.scheduleAt,
    };
  }
}
