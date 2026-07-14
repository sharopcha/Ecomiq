/**
 * Runnable proof — boots the real Nest application context (real
 * `ReviewRequestsService`/`ReviewsService`/`CustomersService`, real
 * Postgres via `crm_db`) and exercises review-request create + the
 * request-to-review auto-link, same "boot the real app context, drive the
 * real services" pattern as `reviews-demo.ts`. Does not need a live Pulsar
 * connection to assert against — the outbox row itself (not delivery) is
 * the thing under test here; `crm:rollup-demo` already proves the outbox
 * relay actually delivers to a live broker.
 *
 * Run:
 *   npm run crm:review-requests-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { ReviewRequestsService } from '../app/review-requests/review-requests.service';
import { ReviewsService } from '../app/reviews/reviews.service';
import { CustomersService } from '../app/customers/customers.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const reviewRequests = app.get(ReviewRequestsService);
  const reviews = app.get(ReviewsService);
  const customers = app.get(CustomersService);
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));

  const customer = await customers.create(storeId, { fullName: 'Review Request Demo Customer', email: 'r@example.com' });
  const orderId = `order-${ulid()}`;

  console.log('[review-requests-demo] create stamps sent_at and emits notify.send...');
  const request = await reviewRequests.create(storeId, { orderId, customerId: customer.id });
  assert(request.sentAt !== null && request.sentAt !== undefined, 'sentAt should be stamped on create');
  assert(request.reviewId == null, 'reviewId should start null');

  const outboxRow = await outboxRepo.findOne({
    where: { eventType: 'notify.send', aggregateId: request.id },
  });
  assert(outboxRow !== null, 'expected an outbox row for notify.send');
  assert(
    (outboxRow.payload as Record<string, unknown>)['template'] === 'review_request',
    'outbox payload should carry template: review_request',
  );
  assert(outboxRow.topic === 'persistent://ecomiq/marketing/notify.commands', `unexpected topic: ${outboxRow.topic}`);
  console.log('[review-requests-demo] OK — sent_at stamped, notify.send outbox row targets marketing/notify.commands.');

  console.log('[review-requests-demo] list returns the created request...');
  const list = await reviewRequests.findAll(storeId, { limit: 10 } as never);
  assert(list.items.some((r) => r.id === request.id), 'findAll should include the created request');
  console.log('[review-requests-demo] OK.');

  console.log('[review-requests-demo] a matching review auto-links to the open request...');
  const review = await reviews.create(storeId, {
    productId: `product-${ulid()}`,
    customerId: customer.id,
    orderId,
    rating: 5,
    body: 'Great!',
  });

  const linkedRequestRepo = app.get(ReviewRequestsService);
  const relisted = await linkedRequestRepo.findAll(storeId, { limit: 10 } as never);
  const linked = relisted.items.find((r) => r.id === request.id);
  assert(linked?.reviewId === review.id, `expected reviewId ${review.id}, got ${linked?.reviewId}`);
  console.log('[review-requests-demo] OK — review_request.review_id linked to the new review.');

  console.log('[review-requests-demo] a second review for the same order+customer does not steal the link...');
  const secondReview = await reviews.create(storeId, {
    productId: `product-${ulid()}`,
    customerId: customer.id,
    orderId,
    rating: 3,
  });
  const stillLinked = (await linkedRequestRepo.findAll(storeId, { limit: 10 } as never)).items.find(
    (r) => r.id === request.id,
  );
  assert(
    stillLinked?.reviewId === review.id,
    `expected the request to stay linked to the first review, got ${stillLinked?.reviewId}`,
  );
  assert(secondReview.id !== review.id, 'sanity: the second review is a distinct row');
  console.log('[review-requests-demo] OK — already-linked request was not overwritten by a second review.');

  console.log('[review-requests-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[review-requests-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[review-requests-demo] FAILED:', err);
  process.exit(1);
});
