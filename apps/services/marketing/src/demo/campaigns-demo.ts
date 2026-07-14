/**
 * Runnable proof — boots the real
 * Nest application context (real `CampaignsService`, Postgres via
 * `marketing_db`) and exercises CRUD + status transitions + outbox rows,
 * same pattern as `discounts-demo.ts`.
 *
 * Run:
 *   npm run marketing:campaigns-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { CampaignsService } from '../app/campaigns/campaigns.service';
import { CampaignKind, CampaignStatus } from '../app/entities/campaign.entity';
import { MarketingEventType } from '../app/events/marketing-event-types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[campaigns-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${Date.now()}`;

  const campaigns = app.get(CampaignsService);
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));

  console.log('[campaigns-demo] creating a draft email campaign...');
  const campaign = await campaigns.create(storeId, {
    kind: CampaignKind.Email,
    title: 'Welcome Series',
  });
  assert(campaign.status === CampaignStatus.Draft, 'a new campaign should start in draft');

  const createdOutbox = await outboxRepo.count({
    where: { aggregateId: campaign.id, eventType: MarketingEventType.CampaignCreated },
  });
  assert(createdOutbox === 1, `expected 1 marketing.campaign.created outbox row, got ${createdOutbox}`);
  console.log('[campaigns-demo] OK — created in draft, 1 outbox row.');

  console.log('[campaigns-demo] trying to pause a draft campaign — expect a conflict...');
  try {
    await campaigns.pause(storeId, campaign.id);
    throw new Error('expected pausing a draft campaign to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'ConflictException', 'expected a ConflictException');
    console.log('[campaigns-demo] OK — pause-on-draft rejected.');
  }

  console.log('[campaigns-demo] scheduling for a future time...');
  const future = new Date(Date.now() + 60_000).toISOString();
  const scheduled = await campaigns.schedule(storeId, campaign.id, { scheduleAt: future });
  assert(scheduled.status === CampaignStatus.Scheduled, 'campaign should be scheduled');
  assert(!!scheduled.scheduleAt, 'expected scheduleAt to be set');
  const scheduledOutbox = await outboxRepo.count({
    where: { aggregateId: campaign.id, eventType: MarketingEventType.CampaignScheduled },
  });
  assert(scheduledOutbox === 1, `expected 1 marketing.campaign.scheduled outbox row, got ${scheduledOutbox}`);
  console.log('[campaigns-demo] OK — scheduled, 1 outbox row.');

  console.log('[campaigns-demo] rescheduling from scheduled — expect success...');
  const rescheduledAt = new Date(Date.now() + 120_000).toISOString();
  const rescheduled = await campaigns.schedule(storeId, campaign.id, { scheduleAt: rescheduledAt });
  assert(rescheduled.status === CampaignStatus.Scheduled, 'campaign should still be scheduled after a reschedule');
  assert(rescheduled.scheduleAt?.toISOString() === rescheduledAt, 'expected scheduleAt to reflect the new time');
  const scheduledOutboxAfterReschedule = await outboxRepo.count({
    where: { aggregateId: campaign.id, eventType: MarketingEventType.CampaignScheduled },
  });
  assert(
    scheduledOutboxAfterReschedule === 2,
    `expected 2 marketing.campaign.scheduled outbox rows after a reschedule, got ${scheduledOutboxAfterReschedule}`,
  );
  console.log('[campaigns-demo] OK — rescheduled, new time recorded, 2nd outbox row present.');

  console.log('[campaigns-demo] scheduling with a past time — expect a bad request...');
  const otherCampaign = await campaigns.create(storeId, {
    kind: CampaignKind.Email,
    title: 'Past Schedule Attempt',
  });
  try {
    await campaigns.schedule(storeId, otherCampaign.id, {
      scheduleAt: new Date(Date.now() - 60_000).toISOString(),
    });
    throw new Error('expected a past scheduleAt to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'BadRequestException', 'expected a BadRequestException');
    console.log('[campaigns-demo] OK — past scheduleAt rejected.');
  }

  console.log('[campaigns-demo] pausing the scheduled campaign...');
  const paused = await campaigns.pause(storeId, campaign.id);
  assert(paused.status === CampaignStatus.Paused, 'campaign should be paused');
  const pausedOutbox = await outboxRepo.count({
    where: { aggregateId: campaign.id, eventType: MarketingEventType.CampaignPaused },
  });
  assert(pausedOutbox === 1, `expected 1 marketing.campaign.paused outbox row, got ${pausedOutbox}`);
  console.log('[campaigns-demo] OK — paused, 1 outbox row.');

  console.log('[campaigns-demo] archiving...');
  const archived = await campaigns.archive(storeId, campaign.id);
  assert(archived.status === CampaignStatus.Archived, 'campaign should be archived');
  const archivedOutbox = await outboxRepo.count({
    where: { aggregateId: campaign.id, eventType: MarketingEventType.CampaignArchived },
  });
  assert(archivedOutbox === 1, `expected 1 marketing.campaign.archived outbox row, got ${archivedOutbox}`);
  console.log('[campaigns-demo] OK — archived, 1 outbox row.');

  console.log('[campaigns-demo] archiving again — expect an idempotent no-op, no duplicate outbox row...');
  await campaigns.archive(storeId, campaign.id);
  const archivedOutboxAfterReplay = await outboxRepo.count({
    where: { aggregateId: campaign.id, eventType: MarketingEventType.CampaignArchived },
  });
  assert(archivedOutboxAfterReplay === 1, 'repeated archive must not create a second outbox row');
  console.log('[campaigns-demo] OK — repeated archive was a no-op.');

  console.log('[campaigns-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[campaigns-demo] FAILED:', err);
  process.exit(1);
});
