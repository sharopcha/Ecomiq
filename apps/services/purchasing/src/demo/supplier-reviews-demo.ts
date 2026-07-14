/**
 * Runnable proof — boots the real Nest application context (real
 * `SuppliersService`/`SupplierReviewsService`, real Postgres via
 * `purchasing_db`) and exercises supplier review CRUD plus the in-
 * transaction rating rollup, same "boot the real app context, drive the
 * real services" pattern as crm's `customers-demo.ts`.
 *
 * Run:
 *   npm run purchasing:supplier-reviews-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { SuppliersService } from '../app/suppliers/suppliers.service';
import { SupplierReviewsService } from '../app/supplier-reviews/supplier-reviews.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const suppliers = app.get(SuppliersService);
  const reviews = app.get(SupplierReviewsService);

  console.log('[supplier-reviews-demo] supplier review CRUD + rollup...');
  const supplier = await suppliers.create(storeId, { name: 'Acme Textiles' });
  assert(supplier.ratingAvg === null, 'new supplier should start with no rating_avg');
  assert(supplier.ratingCount === 0, 'new supplier should start with ratingCount 0');

  const first = await reviews.create(storeId, supplier.id, {
    authorName: 'Jane Buyer',
    rating: 5,
    title: 'Great fabric',
    body: 'Fast turnaround, good quality.',
  });
  assert(first.supplierId === supplier.id, 'created review should belong to the supplier');

  const afterFirst = await suppliers.findOne(storeId, supplier.id);
  assert(afterFirst.ratingCount === 1, `expected ratingCount 1, got ${afterFirst.ratingCount}`);
  assert(afterFirst.ratingAvg === 5, `expected ratingAvg 5, got ${afterFirst.ratingAvg}`);
  console.log('[supplier-reviews-demo] OK — first review sets rating_avg/rating_count.');

  const second = await reviews.create(storeId, supplier.id, { rating: 3 });
  const afterSecond = await suppliers.findOne(storeId, supplier.id);
  assert(afterSecond.ratingCount === 2, `expected ratingCount 2, got ${afterSecond.ratingCount}`);
  assert(afterSecond.ratingAvg === 4, `expected ratingAvg 4 (avg of 5,3), got ${afterSecond.ratingAvg}`);
  console.log('[supplier-reviews-demo] OK — second review recomputes the average.');

  const list = await reviews.findAll(storeId, supplier.id);
  assert(list.length === 2, `expected 2 reviews, got ${list.length}`);

  await reviews.remove(storeId, supplier.id, second.id);
  const afterDelete = await suppliers.findOne(storeId, supplier.id);
  assert(afterDelete.ratingCount === 1, `expected ratingCount 1 after delete, got ${afterDelete.ratingCount}`);
  assert(afterDelete.ratingAvg === 5, `expected ratingAvg back to 5 after delete, got ${afterDelete.ratingAvg}`);
  console.log('[supplier-reviews-demo] OK — delete recomputes the average back down.');

  await reviews.remove(storeId, supplier.id, first.id);
  const afterAllDeleted = await suppliers.findOne(storeId, supplier.id);
  assert(afterAllDeleted.ratingCount === 0, 'ratingCount should be 0 once every review is deleted');
  assert(afterAllDeleted.ratingAvg === null, 'ratingAvg should go back to null once every review is deleted');
  console.log('[supplier-reviews-demo] OK — rating_avg returns to null with zero reviews.');

  let crossStoreRejected = false;
  try {
    await reviews.findAll(`other-store-${ulid()}`, supplier.id);
  } catch {
    crossStoreRejected = true;
  }
  assert(crossStoreRejected, 'review lookup under the wrong storeId must 404 (assertSupplierOwned)');
  console.log('[supplier-reviews-demo] OK — cross-store ownership check confirmed.');

  console.log('[supplier-reviews-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[supplier-reviews-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[supplier-reviews-demo] FAILED:', err);
  process.exit(1);
});
