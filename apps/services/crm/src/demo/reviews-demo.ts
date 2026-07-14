/**
 * Runnable proof — boots the real Nest application context (real
 * `ReviewsService`, real Postgres via `crm_db`) and exercises review
 * create + moderation, same "boot the real app context, drive the real
 * services" pattern as `customers-demo.ts`.
 *
 * Run:
 *   npm run crm:reviews-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { ReviewsService } from '../app/reviews/reviews.service';
import { CustomersService } from '../app/customers/customers.service';
import { ReviewStatus } from '../app/entities/product-review.entity';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const reviews = app.get(ReviewsService);
  const customers = app.get(CustomersService);

  const productId = `product-${ulid()}`;
  // customer_id is a same-DB FK (customer_review_customer_id_fkey) — unlike
  // product_id/order_id (catalog_db/order_db, no cross-DB FK possible), a
  // review's customer must be a real row in crm_db's own customer table.
  const customer = await customers.create(storeId, { fullName: 'Review Demo Customer' });
  const customerId = customer.id;

  console.log('[reviews-demo] create defaults to pending...');
  const review = await reviews.create(storeId, {
    productId,
    customerId,
    rating: 5,
    title: 'Great product',
    body: 'Loved it',
  });
  assert(review.status === ReviewStatus.Pending, `expected pending, got ${review.status}`);

  const secondCustomer = await customers.create(storeId, { fullName: 'Second Review Demo Customer' });
  const secondReview = await reviews.create(storeId, {
    productId,
    customerId: secondCustomer.id,
    rating: 2,
    title: 'Meh',
  });

  console.log('[reviews-demo] list filters by status/product/rating...');
  const byProduct = await reviews.findAll(storeId, { limit: 10, productId } as never);
  assert(byProduct.items.length === 2, `expected 2 reviews for product, got ${byProduct.items.length}`);

  const byRating = await reviews.findAll(storeId, { limit: 10, rating: 5 } as never);
  assert(
    byRating.items.length === 1 && byRating.items[0].id === review.id,
    'rating filter should isolate the 5-star review',
  );
  console.log('[reviews-demo] OK — list + product/rating filters.');

  console.log('[reviews-demo] archive from pending is rejected...');
  let rejectedArchive = false;
  try {
    await reviews.archive(storeId, review.id);
  } catch {
    rejectedArchive = true;
  }
  assert(rejectedArchive, 'archiving a pending review should be rejected (must publish first)');

  console.log('[reviews-demo] publish transitions pending -> published...');
  const published = await reviews.publish(storeId, review.id);
  assert(published.status === ReviewStatus.Published, `expected published, got ${published.status}`);

  let rejectedRepublish = false;
  try {
    await reviews.publish(storeId, review.id);
  } catch {
    rejectedRepublish = true;
  }
  assert(rejectedRepublish, 'publishing an already-published review should be rejected');
  console.log('[reviews-demo] OK — publish transition + illegal re-publish rejected.');

  console.log('[reviews-demo] archive transitions published -> archived...');
  const archived = await reviews.archive(storeId, review.id);
  assert(archived.status === ReviewStatus.Archived, `expected archived, got ${archived.status}`);

  const statusFiltered = await reviews.findAll(storeId, { limit: 10, status: ReviewStatus.Pending } as never);
  assert(
    statusFiltered.items.length === 1 && statusFiltered.items[0].id === secondReview.id,
    'status filter should now only show the still-pending second review',
  );
  console.log('[reviews-demo] OK — archive transition + status filter confirmed.');

  console.log('[reviews-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[reviews-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[reviews-demo] FAILED:', err);
  process.exit(1);
});
