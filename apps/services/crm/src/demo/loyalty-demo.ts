/**
 * Runnable proof — boots the real hybrid app (Pulsar consumers active,
 * including the existing cross-namespace `order.events` subscription) and
 * exercises loyalty accrual via a synthetic `orders.order.placed` event: an
 * account is created on first accrual, points/tier update correctly, a
 * replayed event (or a second event for the same order) doesn't double-
 * accrue (the partial unique index on `loyalty_txn(reason, ref_id)`, not a
 * `processed_event` claim), and a manual adjustment lands as its own txn.
 * Same "publish a synthetic event onto the live topic, wait for the real
 * consumer to react" pattern as `rollup-demo.ts`.
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack).
 *
 * Run:
 *   npm run crm:loyalty-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { PulsarServer, createEnvelope, encodeEnvelope } from '@temp-nx/pulsar';
import { AppModule } from '../app/app.module';
import { LoyaltyAccount, LoyaltyTier } from '../app/entities/loyalty-account.entity';
import { LoyaltyTxn } from '../app/entities/loyalty-txn.entity';
import { CustomersService } from '../app/customers/customers.service';
import { LoyaltyService } from '../app/loyalty/loyalty.service';
import { ORDER_PLACED_EVENT_TYPE, OrderPlacedPayload } from '../app/events/order-placed-event-payload';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[loyalty-demo] ASSERTION FAILED: ${message}`);
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
      throw new Error(`[loyalty-demo] timed out waiting for condition after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  const tenant = process.env.PULSAR_TENANT || 'ecomiq';
  const orderNamespace = process.env.ORDER_PULSAR_NAMESPACE || 'orders';

  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant,
      namespace: orderNamespace,
      aggregates: ['order'],
      subscription: 'order-events::crm-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.init();
  await app.startAllMicroservices();

  const storeId = `demo-store-${ulid()}`;
  const accountRepo = app.get<Repository<LoyaltyAccount>>(getRepositoryToken(LoyaltyAccount));
  const txnRepo = app.get<Repository<LoyaltyTxn>>(getRepositoryToken(LoyaltyTxn));
  const customers = app.get(CustomersService);
  const loyalty = app.get(LoyaltyService);

  const customer = await customers.create(storeId, { fullName: 'Loyalty Demo Customer' });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('pulsar-client');
  const client = new Client({ serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650' });
  const producer = await client.createProducer({
    topic: `persistent://${tenant}/${orderNamespace}/order.events`,
  });

  function orderPlacedEnvelope(orderId: string, totalMinor: number) {
    const payload: OrderPlacedPayload = {
      orderId,
      storeId,
      customerId: customer.id,
      discountId: null,
      discountMinor: 0,
      subtotalMinor: totalMinor,
      totalMinor,
      currency: 'USD',
      shippingAddress: null,
      contactEmail: null,
      lines: [],
    };
    return createEnvelope({
      eventId: `demo-order-placed-${ulid()}`,
      eventType: ORDER_PLACED_EVENT_TYPE,
      storeId,
      aggregateType: 'order',
      aggregateId: orderId,
      payload,
    });
  }

  console.log('[loyalty-demo] publishing orders.order.placed (totalMinor=10000 -> 100 points at earn rate 1)...');
  const firstOrderId = `order_${ulid()}`;
  const firstEnvelope = orderPlacedEnvelope(firstOrderId, 10_000);
  await producer.send({ data: encodeEnvelope(firstEnvelope) });

  const afterFirst = await waitUntil(
    () => accountRepo.findOne({ where: { storeId, customerId: customer.id } }),
    () => true,
    30_000,
  );
  assert(afterFirst.points === 100, `expected 100 points, got ${afterFirst.points}`);
  assert(afterFirst.tier === LoyaltyTier.Bronze, `expected bronze tier, got ${afterFirst.tier}`);
  console.log('[loyalty-demo] OK — account created, 100 points accrued, bronze tier.');

  console.log('[loyalty-demo] replaying the same event (same eventId) does not double-accrue...');
  await producer.send({ data: encodeEnvelope(firstEnvelope) });
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const afterReplay = await accountRepo.findOne({ where: { storeId, customerId: customer.id } });
  assert(afterReplay.points === 100, `expected points to stay 100 after a replay, got ${afterReplay.points}`);
  const txnCount = await txnRepo.count({ where: { storeId, accountId: afterReplay.id } });
  assert(txnCount === 1, `expected exactly 1 txn after a replay, got ${txnCount}`);
  console.log('[loyalty-demo] OK — partial unique index on (reason, ref_id) made the replay a true no-op.');

  console.log('[loyalty-demo] a big enough order pushes the account into silver tier...');
  const secondOrderId = `order_${ulid()}`;
  await producer.send({ data: encodeEnvelope(orderPlacedEnvelope(secondOrderId, 50_000)) }); // +500 points -> 600 total
  const afterSecond = await waitUntil(
    () => accountRepo.findOne({ where: { storeId, customerId: customer.id } }),
    (a) => a.points === 600,
    30_000,
  );
  assert(afterSecond.tier === LoyaltyTier.Silver, `expected silver tier at 600 points, got ${afterSecond.tier}`);
  console.log('[loyalty-demo] OK — 600 points, silver tier.');

  console.log('[loyalty-demo] manual adjustment (admin) is its own txn, no ref_id...');
  const afterAdjust = await loyalty.manualAdjust(storeId, customer.id, 1500, 'goodwill credit');
  assert(afterAdjust.points === 2100, `expected 2100 points after manual +1500, got ${afterAdjust.points}`);
  assert(afterAdjust.tier === LoyaltyTier.Gold, `expected gold tier at 2100 points, got ${afterAdjust.tier}`);
  console.log('[loyalty-demo] OK — 2100 points, gold tier.');

  const history = await loyalty.listTxns(storeId, customer.id, { limit: 10 } as never);
  assert(history.items.length === 3, `expected 3 txns in history, got ${history.items.length}`);
  console.log('[loyalty-demo] OK — full txn history has 3 rows (2 order accruals + 1 manual).');

  await producer.close();
  await client.close();

  console.log('[loyalty-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[loyalty-demo] FAILED:', err);
  process.exit(1);
});
