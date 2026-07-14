/**
 * Runnable proof — boots the real hybrid app (Pulsar consumers active,
 * including the new cross-namespace `crm/segment.events` subscription) and
 * exercises: a synthetic `crm.segment.updated` event upserting
 * `segment_snapshot`, an older (stale) redelivery being rejected by the
 * event-time guard, a newer event applying cleanly, and
 * `CampaignsService.fire()` resolving recipients from the snapshot instead
 * of the loose `audience.emails` list (with the audience fallback proven
 * when no `segmentId` is set). Same "publish a synthetic event onto the
 * live topic, wait for the real consumer to react" pattern as
 * catalog-service's `review-sync-demo.ts`.
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack).
 *
 * Run:
 *   npm run marketing:segment-sync-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { PulsarServer, createEnvelope, encodeEnvelope } from '@temp-nx/pulsar';
import { AppModule } from '../app/app.module';
import { SegmentSnapshot } from '../app/entities/segment-snapshot.entity';
import { Campaign, CampaignKind } from '../app/entities/campaign.entity';
import { CampaignSend } from '../app/entities/campaign-send.entity';
import { CampaignsService } from '../app/campaigns/campaigns.service';
import { SEGMENT_UPDATED_EVENT_TYPE, SegmentEventPayload } from '../app/segment-sync/segment-event-payload';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[segment-sync-demo] ASSERTION FAILED: ${message}`);
  }
}

async function waitUntil<T>(
  fn: () => Promise<T | null | undefined>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  intervalMs = 500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value && predicate(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(`[segment-sync-demo] timed out waiting for condition after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  const tenant = process.env.PULSAR_TENANT || 'ecomiq';
  const crmNamespace = process.env.CRM_PULSAR_NAMESPACE || 'crm';

  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant,
      namespace: crmNamespace,
      aggregates: ['segment'],
      subscription: 'segment-events::marketing-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.init();
  await app.startAllMicroservices();

  const storeId = `demo-store-${ulid()}`;
  const segmentId = `segment_${ulid()}`;
  const snapshotRepo = app.get<Repository<SegmentSnapshot>>(getRepositoryToken(SegmentSnapshot));
  const campaigns = app.get(CampaignsService);
  const campaignRepo = app.get<Repository<Campaign>>(getRepositoryToken(Campaign));
  const sendRepo = app.get<Repository<CampaignSend>>(getRepositoryToken(CampaignSend));

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('pulsar-client');
  const client = new Client({ serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650' });
  const producer = await client.createProducer({
    topic: `persistent://${tenant}/${crmNamespace}/segment.events`,
  });

  function publish(payload: SegmentEventPayload, occurredAt: Date, eventIdSuffix: string) {
    const envelope = createEnvelope({
      eventId: `demo-segment-updated-${eventIdSuffix}`,
      eventType: SEGMENT_UPDATED_EVENT_TYPE,
      storeId,
      aggregateType: 'segment',
      aggregateId: payload.segmentId,
      payload,
      occurredAt,
    });
    return producer.send({ data: encodeEnvelope(envelope) });
  }

  console.log('[segment-sync-demo] publishing the first crm.segment.updated event (2 members)...');
  const t1 = new Date(Date.now() - 10_000);
  await publish(
    { segmentId, storeId, name: 'Big spenders', memberCount: 2, memberEmails: ['a@example.com', 'b@example.com'] },
    t1,
    '1',
  );
  const afterFirst = await waitUntil(
    () => snapshotRepo.findOne({ where: { id: segmentId } }),
    (s) => s.memberCount > 0,
    30_000,
  );
  assert(afterFirst.memberCount === 2, `expected memberCount=2, got ${afterFirst.memberCount}`);
  assert(afterFirst.name === 'Big spenders', `expected name "Big spenders", got ${afterFirst.name}`);
  assert(
    JSON.stringify(afterFirst.memberEmails) === JSON.stringify(['a@example.com', 'b@example.com']),
    `expected the two seeded emails, got ${JSON.stringify(afterFirst.memberEmails)}`,
  );
  console.log('[segment-sync-demo] OK — snapshot created with 2 members.');

  console.log('[segment-sync-demo] publishing an older (stale) event — must be rejected by the event-time guard...');
  const t0 = new Date(Date.now() - 60_000); // older than t1
  await publish(
    { segmentId, storeId, name: 'Stale name', memberCount: 99, memberEmails: ['stale@example.com'] },
    t0,
    '0-stale',
  );
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const afterStale = await snapshotRepo.findOne({ where: { id: segmentId } });
  assert(afterStale.memberCount === 2, `stale event must not overwrite memberCount, got ${afterStale.memberCount}`);
  assert(afterStale.name === 'Big spenders', 'stale event must not overwrite name');
  console.log('[segment-sync-demo] OK — stale (older event_time) redelivery was rejected.');

  console.log('[segment-sync-demo] publishing a newer event (3 members) — must apply...');
  const t2 = new Date();
  await publish(
    {
      segmentId,
      storeId,
      name: 'Big spenders',
      memberCount: 3,
      memberEmails: ['a@example.com', 'b@example.com', 'c@example.com'],
    },
    t2,
    '2',
  );
  const afterSecond = await waitUntil(
    () => snapshotRepo.findOne({ where: { id: segmentId } }),
    (s) => s.memberCount === 3,
    30_000,
  );
  assert(afterSecond.memberCount === 3, `expected memberCount=3, got ${afterSecond.memberCount}`);
  console.log('[segment-sync-demo] OK — newer event applied, memberCount now 3.');

  console.log('[segment-sync-demo] campaign with segmentId resolves recipients from the snapshot at fire time...');
  const segmentCampaign = await campaigns.create(storeId, {
    kind: CampaignKind.Email,
    title: 'Segment Recipients Demo',
    segmentId,
    contentRef: { subject: 'Hello segment' },
  });
  const scheduleAt = new Date(Date.now() + 150);
  await campaigns.schedule(storeId, segmentCampaign.id, { scheduleAt: scheduleAt.toISOString() });
  await new Promise((resolve) => setTimeout(resolve, 250));
  await campaigns.fire(storeId, segmentCampaign.id, scheduleAt);

  const firedSegmentCampaign = await campaignRepo.findOneByOrFail({ id: segmentCampaign.id });
  assert(
    (firedSegmentCampaign.stats as { totalRecipients?: number } | null)?.totalRecipients === 3,
    `expected 3 recipients resolved from the segment snapshot, got ${JSON.stringify(firedSegmentCampaign.stats)}`,
  );
  const segmentSends = await sendRepo.find({ where: { campaign: { id: segmentCampaign.id } } });
  assert(segmentSends.length === 3, `expected 3 campaign_send rows from the segment, got ${segmentSends.length}`);
  console.log('[segment-sync-demo] OK — 3 recipients resolved from segment_snapshot, not audience.emails.');

  console.log('[segment-sync-demo] campaign with no segmentId still falls back to audience.emails...');
  const audienceCampaign = await campaigns.create(storeId, {
    kind: CampaignKind.Email,
    title: 'Audience Fallback Demo',
    audience: { emails: ['fallback@example.com'] },
  });
  const scheduleAt2 = new Date(Date.now() + 150);
  await campaigns.schedule(storeId, audienceCampaign.id, { scheduleAt: scheduleAt2.toISOString() });
  await new Promise((resolve) => setTimeout(resolve, 250));
  await campaigns.fire(storeId, audienceCampaign.id, scheduleAt2);

  const firedAudienceCampaign = await campaignRepo.findOneByOrFail({ id: audienceCampaign.id });
  assert(
    (firedAudienceCampaign.stats as { totalRecipients?: number } | null)?.totalRecipients === 1,
    `expected 1 fallback recipient, got ${JSON.stringify(firedAudienceCampaign.stats)}`,
  );
  console.log('[segment-sync-demo] OK — no segmentId set, audience.emails fallback used.');

  await producer.close();
  await client.close();

  console.log('[segment-sync-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[segment-sync-demo] FAILED:', err);
  process.exit(1);
});
