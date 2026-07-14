/**
 * Runnable proof — boots the real
 * Nest application context (real `CampaignsService`, Postgres via
 * `marketing_db`) and drives `CampaignsService.fire()` directly with
 * synthetic `armedScheduleAt` values — the real delayed-message wait isn't
 * exercised here (that's proven live on the running stack instead, same
 * substitution every other synthetic-envelope demo in this repo uses for
 * the same reason). This demo is about the fire logic itself: audience
 * expansion, notify.send commands, the reschedule guard, and
 * pause-before-fire.
 *
 * Run:
 *   npm run marketing:campaign-fire-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { CampaignsService } from '../app/campaigns/campaigns.service';
import { CampaignSend } from '../app/entities/campaign-send.entity';
import { Campaign, CampaignKind, CampaignStatus } from '../app/entities/campaign.entity';
import { CampaignSendEventKind } from '../app/campaigns/dto/record-send-event.dto';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[campaign-fire-demo] ASSERTION FAILED: ${message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${Date.now()}`;

  const campaigns = app.get(CampaignsService);
  const campaignRepo = app.get<Repository<Campaign>>(getRepositoryToken(Campaign));
  const sendRepo = app.get<Repository<CampaignSend>>(getRepositoryToken(CampaignSend));
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));

  console.log('[campaign-fire-demo] happy path: schedule -> fire -> sends + notify commands...');
  {
    const campaign = await campaigns.create(storeId, {
      kind: CampaignKind.Email,
      title: 'Fire Demo Campaign',
      audience: { emails: ['a@example.com', 'b@example.com'] },
      contentRef: { subject: 'Hello' },
    });
    const scheduleAt = new Date(Date.now() + 150);
    await campaigns.schedule(storeId, campaign.id, { scheduleAt: scheduleAt.toISOString() });
    await sleep(250); // let scheduleAt genuinely pass — assertCampaignFire's NOT_YET_DUE check is real, not just a status check

    await campaigns.fire(storeId, campaign.id, scheduleAt);

    const fired = await campaignRepo.findOneByOrFail({ id: campaign.id });
    assert(fired.status === CampaignStatus.Sent, `expected sent, got ${fired.status}`);
    assert(
      (fired.stats as { totalRecipients?: number } | null)?.totalRecipients === 2,
      `expected totalRecipients=2, got ${JSON.stringify(fired.stats)}`,
    );

    const sends = await sendRepo.find({ where: { campaign: { id: campaign.id } } });
    assert(sends.length === 2, `expected 2 campaign_send rows, got ${sends.length}`);
    assert(sends.every((s) => !!s.sentAt), 'expected every send to have sentAt set');

    const notifyCount = await outboxRepo.count({
      where: { aggregateId: campaign.id, eventType: 'notify.send' },
    });
    assert(notifyCount === 2, `expected 2 notify.send outbox rows, got ${notifyCount}`);
    const oneNotify = await outboxRepo.findOne({ where: { aggregateId: campaign.id, eventType: 'notify.send' } });
    assert(
      oneNotify?.topic === 'persistent://ecomiq/marketing/notify.commands',
      `expected the notify.send topic override to target marketing's command topic, got ${oneNotify?.topic}`,
    );
    console.log('[campaign-fire-demo] OK — sent, 2 sends, 2 notify.send commands with the correct topic override.');

    console.log('[campaign-fire-demo] engagement write-back: opened, then a duplicate opened...');
    const [firstSend] = sends;
    const opened = await campaigns.recordSendEvent(storeId, campaign.id, firstSend.id, CampaignSendEventKind.Opened);
    assert(!!opened.openedAt, 'expected openedAt to be set');
    const afterFirstOpen = await campaignRepo.findOneByOrFail({ id: campaign.id });
    assert(
      (afterFirstOpen.stats as { opened?: number } | null)?.opened === 1,
      `expected stats.opened=1, got ${JSON.stringify(afterFirstOpen.stats)}`,
    );
    await campaigns.recordSendEvent(storeId, campaign.id, firstSend.id, CampaignSendEventKind.Opened);
    const afterDuplicateOpen = await campaignRepo.findOneByOrFail({ id: campaign.id });
    assert(
      (afterDuplicateOpen.stats as { opened?: number } | null)?.opened === 1,
      'a duplicate opened event must not double-count stats.opened',
    );
    console.log('[campaign-fire-demo] OK — opened recorded once, duplicate did not double-count.');
  }

  console.log('[campaign-fire-demo] reschedule guard: stale fire message is ignored, new time is honored...');
  {
    const campaign = await campaigns.create(storeId, {
      kind: CampaignKind.Email,
      title: 'Reschedule Demo Campaign',
      audience: { emails: ['c@example.com'] },
    });
    const firstScheduleAt = new Date(Date.now() + 150);
    await campaigns.schedule(storeId, campaign.id, { scheduleAt: firstScheduleAt.toISOString() });

    const secondScheduleAt = new Date(Date.now() + 400);
    await campaigns.schedule(storeId, campaign.id, { scheduleAt: secondScheduleAt.toISOString() });

    // The stale first delayed message arrives late — must be a no-op
    // regardless of timing (the reschedule-guard's STALE_RESCHEDULE check
    // fires before the due-time check even runs).
    await campaigns.fire(storeId, campaign.id, firstScheduleAt);
    const afterStaleFire = await campaignRepo.findOneByOrFail({ id: campaign.id });
    assert(
      afterStaleFire.status === CampaignStatus.Scheduled,
      `expected the stale message to be a no-op (still scheduled), got ${afterStaleFire.status}`,
    );
    const sendsAfterStale = await sendRepo.count({ where: { campaign: { id: campaign.id } } });
    assert(sendsAfterStale === 0, 'a stale reschedule message must not create sends');

    // The current (second) delayed message arrives — fires for real, once its own time has genuinely passed.
    await sleep(450);
    await campaigns.fire(storeId, campaign.id, secondScheduleAt);
    const afterRealFire = await campaignRepo.findOneByOrFail({ id: campaign.id });
    assert(afterRealFire.status === CampaignStatus.Sent, `expected sent after the real fire, got ${afterRealFire.status}`);
    console.log('[campaign-fire-demo] OK — stale message ignored, rescheduled time honored.');
  }

  console.log('[campaign-fire-demo] pause before fire: no send...');
  {
    const campaign = await campaigns.create(storeId, {
      kind: CampaignKind.Email,
      title: 'Pause Demo Campaign',
      audience: { emails: ['d@example.com'] },
    });
    const scheduleAt = new Date(Date.now() + 60_000);
    await campaigns.schedule(storeId, campaign.id, { scheduleAt: scheduleAt.toISOString() });
    await campaigns.pause(storeId, campaign.id);

    await campaigns.fire(storeId, campaign.id, scheduleAt);

    const afterFire = await campaignRepo.findOneByOrFail({ id: campaign.id });
    assert(afterFire.status === CampaignStatus.Paused, `expected paused (no fire), got ${afterFire.status}`);
    const sends = await sendRepo.count({ where: { campaign: { id: campaign.id } } });
    assert(sends === 0, 'a paused campaign must not send');
    console.log('[campaign-fire-demo] OK — pause before fire prevented the send.');
  }

  console.log('[campaign-fire-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[campaign-fire-demo] FAILED:', err);
  process.exit(1);
});
