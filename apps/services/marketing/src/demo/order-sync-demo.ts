/**
 * Runnable proof — boots the real
 * Nest application context (real `OrderSyncService`, `DiscountsService`,
 * Postgres via `marketing_db`) and drives synthetic `orders.order.placed`/
 * `.canceled` payloads directly through the handler, same "drive the real
 * services" pattern as payment's `intents-demo.ts`. `main.ts`'s actual
 * Pulsar subscription needs zero changes as long as the real producer
 * honors this same payload contract.
 *
 * Run:
 *   npm run marketing:order-sync-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app/app.module';
import { DiscountsService } from '../app/discounts/discounts.service';
import { OrderSyncService } from '../app/order-sync/order-sync.service';
import { Discount, DiscountKind } from '../app/entities/discount.entity';
import { DiscountUsage } from '../app/entities/discount-usage.entity';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[order-sync-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${Date.now()}`;
  const orderId = `demo-order-${Date.now()}`;
  const customerId = `demo-customer-${Date.now()}`;

  const discounts = app.get(DiscountsService);
  const orderSync = app.get(OrderSyncService);
  const discountRepo = app.get<Repository<Discount>>(getRepositoryToken(Discount));
  const usageRepo = app.get<Repository<DiscountUsage>>(getRepositoryToken(DiscountUsage));

  console.log('[order-sync-demo] creating + activating a discount...');
  const discount = await discounts.create(storeId, {
    code: 'SYNC10',
    kind: DiscountKind.Percentage,
    value: 1000,
  });
  await discounts.activate(storeId, discount.id);

  console.log('[order-sync-demo] delivering a synthetic orders.order.placed event...');
  await orderSync.recordUsage(storeId, {
    orderId,
    storeId,
    customerId,
    discountId: discount.id,
    discountMinor: 1000,
    subtotalMinor: 10000,
  });

  const usage = await usageRepo.findOneBy({ orderId });
  assert(!!usage, 'expected a DiscountUsage row to exist');
  const afterFirst = await discountRepo.findOneByOrFail({ id: discount.id });
  assert(afterFirst.usageCount === 1, `expected usageCount=1, got ${afterFirst.usageCount}`);
  console.log('[order-sync-demo] OK — usage row created, usageCount incremented to 1.');

  console.log('[order-sync-demo] redelivering the same placed event (duplicate)...');
  await orderSync.recordUsage(storeId, {
    orderId,
    storeId,
    customerId,
    discountId: discount.id,
    discountMinor: 1000,
    subtotalMinor: 10000,
  });
  const usageCountAfterDuplicate = await usageRepo.count({ where: { orderId } });
  assert(usageCountAfterDuplicate === 1, `duplicate delivery must not create a second usage row, got ${usageCountAfterDuplicate}`);
  const afterDuplicate = await discountRepo.findOneByOrFail({ id: discount.id });
  assert(afterDuplicate.usageCount === 1, `duplicate delivery must not double-increment usageCount, got ${afterDuplicate.usageCount}`);
  console.log('[order-sync-demo] OK — duplicate delivery was a no-op, no double-count.');

  console.log('[order-sync-demo] delivering a synthetic orders.order.canceled event...');
  await orderSync.releaseUsage(storeId, { orderId, storeId, discountId: discount.id });
  const usageAfterCancel = await usageRepo.findOneBy({ orderId });
  assert(!usageAfterCancel, 'expected the usage row to be removed after cancellation');
  const afterCancel = await discountRepo.findOneByOrFail({ id: discount.id });
  assert(afterCancel.usageCount === 0, `expected usageCount=0 after release, got ${afterCancel.usageCount}`);
  console.log('[order-sync-demo] OK — usage row removed, usageCount decremented to 0.');

  console.log('[order-sync-demo] redelivering the same canceled event (duplicate)...');
  await orderSync.releaseUsage(storeId, { orderId, storeId, discountId: discount.id });
  const afterDuplicateCancel = await discountRepo.findOneByOrFail({ id: discount.id });
  assert(afterDuplicateCancel.usageCount === 0, 'duplicate cancel must not decrement below 0');
  console.log('[order-sync-demo] OK — duplicate cancel was a no-op.');

  console.log('[order-sync-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[order-sync-demo] FAILED:', err);
  process.exit(1);
});
