/**
 * Runnable proof — boots the real hybrid app (Pulsar consumers active,
 * including the new cross-namespace `crm/review.events` subscription) and
 * exercises synthetic `crm.review.published`/`crm.review.archived` events:
 * the product's `rating_avg`/`rating_count` update, a duplicate event is a
 * no-op (idempotent via `processed_event`), and archiving recomputes the
 * average back down. Same "publish a synthetic event onto the live topic,
 * wait for the real consumer to react" pattern as crm-service's
 * `rollup-demo.ts`.
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack).
 *
 * Run:
 *   npm run catalog:review-sync-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { PulsarServer, createEnvelope, encodeEnvelope } from '@temp-nx/pulsar';
import { AppModule } from '../app/app.module';
import { Product } from '../app/entities/product.entity';
import {
  REVIEW_ARCHIVED_EVENT_TYPE,
  REVIEW_PUBLISHED_EVENT_TYPE,
  ReviewEventPayload,
} from '../app/catalog-sync/review-event-payload';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[review-sync-demo] ASSERTION FAILED: ${message}`);
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
      throw new Error(`[review-sync-demo] timed out waiting for condition after ${timeoutMs}ms`);
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
      aggregates: ['review'],
      subscription: 'review-events::catalog-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.init();
  await app.startAllMicroservices();

  const storeId = `demo-store-${ulid()}`;
  const productRepo = app.get<Repository<Product>>(getRepositoryToken(Product));

  const product = await productRepo.save(
    productRepo.create({ storeId, displayNumber: 1, name: 'Review Sync Demo Product' }),
  );
  assert(product.ratingCount === 0, 'new product should start with rating_count 0');
  assert(product.ratingAvg == null, 'new product should start with rating_avg null');

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('pulsar-client');
  const client = new Client({ serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650' });
  const producer = await client.createProducer({
    topic: `persistent://${tenant}/${crmNamespace}/review.events`,
  });

  console.log('[review-sync-demo] publishing a synthetic crm.review.published event (rating 5)...');
  const reviewId = `review_${ulid()}`;
  const publishedPayload: ReviewEventPayload = {
    id: reviewId,
    storeId,
    productId: product.id,
    customerId: null,
    rating: 5,
    status: 'published',
  };
  const publishedEnvelope = createEnvelope({
    eventId: `demo-review-published-${ulid()}`,
    eventType: REVIEW_PUBLISHED_EVENT_TYPE,
    storeId,
    aggregateType: 'review',
    aggregateId: reviewId,
    payload: publishedPayload,
  });
  await producer.send({ data: encodeEnvelope(publishedEnvelope) });

  console.log('[review-sync-demo] waiting for the real consumer to update rating_avg/rating_count (up to 30s)...');
  const afterFirst = await waitUntil(
    () => productRepo.findOne({ where: { id: product.id } }),
    (p) => p.ratingCount > 0,
    30_000,
  );
  assert(afterFirst.ratingCount === 1, `expected rating_count=1, got ${afterFirst.ratingCount}`);
  assert(Number(afterFirst.ratingAvg) === 5, `expected rating_avg=5, got ${afterFirst.ratingAvg}`);
  console.log('[review-sync-demo] OK — rating_avg=5, rating_count=1 after the first published review.');

  console.log('[review-sync-demo] publishing a duplicate of the same event (same eventId)...');
  await producer.send({ data: encodeEnvelope(publishedEnvelope) });
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const afterDuplicate = await productRepo.findOne({ where: { id: product.id } });
  assert(afterDuplicate.ratingCount === 1, `expected rating_count to stay 1 after a replay, got ${afterDuplicate.ratingCount}`);
  console.log('[review-sync-demo] OK — duplicate event was a no-op (processed_event dedup ledger).');

  console.log('[review-sync-demo] publishing a second published review (rating 3) -> average recomputes...');
  const secondReviewId = `review_${ulid()}`;
  const secondPayload: ReviewEventPayload = { ...publishedPayload, id: secondReviewId, rating: 3 };
  const secondEnvelope = createEnvelope({
    eventId: `demo-review-published-2-${ulid()}`,
    eventType: REVIEW_PUBLISHED_EVENT_TYPE,
    storeId,
    aggregateType: 'review',
    aggregateId: secondReviewId,
    payload: secondPayload,
  });
  await producer.send({ data: encodeEnvelope(secondEnvelope) });
  const afterSecond = await waitUntil(
    () => productRepo.findOne({ where: { id: product.id } }),
    (p) => p.ratingCount === 2,
    30_000,
  );
  assert(Number(afterSecond.ratingAvg) === 4, `expected rating_avg=4 ((5+3)/2), got ${afterSecond.ratingAvg}`);
  console.log('[review-sync-demo] OK — rating_avg recomputed to 4 across two published reviews.');

  console.log('[review-sync-demo] archiving the second review (rating 3) -> average recomputes back to 5...');
  const archivedEnvelope = createEnvelope({
    eventId: `demo-review-archived-${ulid()}`,
    eventType: REVIEW_ARCHIVED_EVENT_TYPE,
    storeId,
    aggregateType: 'review',
    aggregateId: secondReviewId,
    payload: secondPayload,
  });
  await producer.send({ data: encodeEnvelope(archivedEnvelope) });
  const afterArchive = await waitUntil(
    () => productRepo.findOne({ where: { id: product.id } }),
    (p) => p.ratingCount === 1,
    30_000,
  );
  assert(Number(afterArchive.ratingAvg) === 5, `expected rating_avg=5 after archiving the 3-star review, got ${afterArchive.ratingAvg}`);
  console.log('[review-sync-demo] OK — archiving recomputed rating_avg back to 5, rating_count back to 1.');

  await producer.close();
  await client.close();

  console.log('[review-sync-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[review-sync-demo] FAILED:', err);
  process.exit(1);
});
