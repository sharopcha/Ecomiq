/**
 * Runnable proof — boots the real
 * Nest application context (real `OrdersService`, `InvoicesService`,
 * Postgres via `order_db`) and exercises the full lifecycle: create
 * (draft) -> confirm (open) -> totals correct -> displayNumbers strictly
 * sequential under 10 concurrent creates (the `store_sequence` `FOR UPDATE`
 * proof) -> cancel -> activity_log + outbox rows for each transition.
 * Same "drive the real services" pattern as marketing's `discounts-demo.ts`.
 *
 * Run:
 *   npm run order:orders-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { OrdersService } from '../app/orders/orders.service';
import { InvoicesService } from '../app/invoices/invoices.service';
import { ActivityLog } from '../app/entities/activity-log.entity';
import { OrderStatus } from '../app/entities/order.entity';
import { OrderEventType } from '../app/events/order-event-types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[orders-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${Date.now()}`;

  const orders = app.get(OrdersService);
  const invoices = app.get(InvoicesService);
  const activityRepo = app.get<Repository<ActivityLog>>(getRepositoryToken(ActivityLog));
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));

  console.log('[orders-demo] creating a draft order with 2 lines...');
  const draft = await orders.create(storeId, {
    status: OrderStatus.Draft,
    lines: [
      { variantId: 'variant_1', name: 'Blue Hoodie', qty: 2, unitPriceMinor: 3000 },
      { variantId: 'variant_2', name: 'Red Cap', qty: 1, unitPriceMinor: 1500 },
    ],
    shippingFeeMinor: 500,
    taxMinor: 200,
  });
  assert(draft.status === OrderStatus.Draft, `expected draft status, got ${draft.status}`);
  assert(draft.subtotalMinor === 2 * 3000 + 1500, `expected subtotal 7500, got ${draft.subtotalMinor}`);
  assert(
    draft.totalMinor === draft.subtotalMinor + 500 + 200,
    `expected total ${draft.subtotalMinor + 700}, got ${draft.totalMinor}`,
  );
  const createdOutbox = await outboxRepo.count({
    where: { aggregateId: draft.id, eventType: OrderEventType.OrderCreated },
  });
  assert(createdOutbox === 1, `expected 1 orders.order.created outbox row, got ${createdOutbox}`);
  console.log('[orders-demo] OK — draft created, totals correct, 1 outbox row.');

  console.log('[orders-demo] confirming draft -> open...');
  const confirmed = await orders.confirm(storeId, draft.id);
  assert(confirmed.status === OrderStatus.Open, `expected open status, got ${confirmed.status}`);
  console.log('[orders-demo] OK — confirmed to open.');

  console.log('[orders-demo] firing 10 concurrent order creates for a fresh store (store_sequence race)...');
  const raceStoreId = `demo-store-race-${Date.now()}`;
  const concurrent = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      orders.create(raceStoreId, {
        status: OrderStatus.Open,
        lines: [{ variantId: 'variant_x', name: `Item ${i}`, qty: 1, unitPriceMinor: 100 }],
      }),
    ),
  );
  const displayNumbers = concurrent.map((o) => o.displayNumber).sort((a, b) => a - b);
  const expected = Array.from({ length: 10 }, (_, i) => i + 1);
  assert(
    JSON.stringify(displayNumbers) === JSON.stringify(expected),
    `expected displayNumbers 1..10 with no gaps/dupes, got ${JSON.stringify(displayNumbers)}`,
  );
  console.log('[orders-demo] OK — 10 concurrent creates got strictly sequential, non-colliding displayNumbers.');

  console.log('[orders-demo] issuing an invoice snapshot...');
  const invoice = await invoices.createForOrder(storeId, confirmed.id);
  assert(invoice.displayId.startsWith('INV-'), `expected an INV- displayId, got ${invoice.displayId}`);
  assert(
    (invoice.totals as { totalMinor: number }).totalMinor === confirmed.totalMinor,
    'invoice totals snapshot should match the order at issue time',
  );
  console.log(`[orders-demo] OK — invoice ${invoice.displayId} issued with a matching totals snapshot.`);

  console.log('[orders-demo] canceling the confirmed order...');
  const canceled = await orders.cancel(storeId, confirmed.id, 'customer changed their mind');
  assert(canceled.status === OrderStatus.Canceled, `expected canceled status, got ${canceled.status}`);
  assert(canceled.cancelReason === 'customer changed their mind', 'expected the cancel reason to be persisted');
  const canceledOutbox = await outboxRepo.count({
    where: { aggregateId: canceled.id, eventType: OrderEventType.OrderCanceled },
  });
  assert(canceledOutbox === 1, `expected 1 orders.order.canceled outbox row, got ${canceledOutbox}`);
  console.log('[orders-demo] OK — canceled, 1 outbox row.');

  console.log('[orders-demo] canceling again — expect a conflict, not a silent no-op...');
  try {
    await orders.cancel(storeId, canceled.id);
    throw new Error('expected re-canceling an already-canceled order to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'ConflictException', 'expected a ConflictException');
    console.log('[orders-demo] OK — double-cancel rejected.');
  }

  console.log('[orders-demo] verifying activity_log rows exist for every transition...');
  const verbs = (await activityRepo.find({ where: { subjectId: draft.id, storeId }, order: { createdAt: 'ASC' } })).map(
    (row) => row.verb,
  );
  for (const expectedVerb of ['order.created', 'order.confirmed', 'order.invoice_issued', 'order.canceled']) {
    assert(verbs.includes(expectedVerb), `expected an activity_log row with verb ${expectedVerb}, got ${JSON.stringify(verbs)}`);
  }
  console.log('[orders-demo] OK — activity_log has a row for every transition.');

  console.log('[orders-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[orders-demo] FAILED:', err);
  process.exit(1);
});
