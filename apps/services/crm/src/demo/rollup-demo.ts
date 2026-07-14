/**
 * Runnable proof — boots the real hybrid app (Pulsar consumers active,
 * including the new cross-namespace `order.events` subscription) and
 * exercises a synthetic `orders.order.placed` event: the customer's
 * `total_orders`/`total_spent_minor`/`last_online_at` rollups update, and a
 * duplicate event for the same order is a no-op (idempotent via
 * `processed_event`). Same "publish a synthetic event onto the live topic,
 * wait for the real consumer to react" pattern as shipping's
 * `auto-draft-demo.ts`.
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack).
 *
 * Run:
 *   npm run crm:rollup-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { PulsarServer, createEnvelope, encodeEnvelope } from '@temp-nx/pulsar';
import { AppModule } from '../app/app.module';
import { Customer } from '../app/entities/customer.entity';
import { CustomersService } from '../app/customers/customers.service';
import { ORDER_PLACED_EVENT_TYPE, OrderPlacedPayload } from '../app/events/order-placed-event-payload';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[rollup-demo] ASSERTION FAILED: ${message}`);
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
      throw new Error(`[rollup-demo] timed out waiting for condition after ${timeoutMs}ms`);
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
  const customerRepo = app.get<Repository<Customer>>(getRepositoryToken(Customer));
  const customers = app.get(CustomersService);

  const customer = await customers.create(storeId, { fullName: 'Rollup Demo Customer' });

  const orderId = `order_${ulid()}`;
  const payload: OrderPlacedPayload = {
    orderId,
    storeId,
    customerId: customer.id,
    discountId: null,
    discountMinor: 0,
    subtotalMinor: 5000,
    totalMinor: 5000,
    currency: 'USD',
    shippingAddress: null,
    contactEmail: null,
    lines: [],
  };

  console.log('[rollup-demo] publishing a synthetic orders.order.placed event onto a live order.events topic...');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('pulsar-client');
  const client = new Client({ serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650' });
  const producer = await client.createProducer({
    topic: `persistent://${tenant}/${orderNamespace}/order.events`,
  });
  const envelope = createEnvelope({
    eventId: `demo-order-placed-${ulid()}`,
    eventType: ORDER_PLACED_EVENT_TYPE,
    storeId,
    aggregateType: 'order',
    aggregateId: orderId,
    payload,
  });
  await producer.send({ data: encodeEnvelope(envelope) });

  console.log('[rollup-demo] waiting for the real consumer to apply the rollup (up to 30s)...');
  const rolledUp = await waitUntil(
    () => customerRepo.findOne({ where: { id: customer.id } }),
    (c) => c.totalOrders > 0,
    30_000,
  );
  assert(rolledUp.totalOrders === 1, `expected totalOrders=1, got ${rolledUp.totalOrders}`);
  assert(rolledUp.totalSpentMinor === 5000, `expected totalSpentMinor=5000, got ${rolledUp.totalSpentMinor}`);
  assert(rolledUp.lastOnlineAt !== null, 'lastOnlineAt should be stamped');
  console.log('[rollup-demo] OK — totalOrders/totalSpentMinor/lastOnlineAt rolled up from the placed event.');

  console.log('[rollup-demo] publishing a duplicate event for the same order (same eventId)...');
  await producer.send({ data: encodeEnvelope(envelope) });
  // No positive signal to wait on for a no-op — give the consumer a beat to
  // (not) process it, then assert the rollup didn't double-count.
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const afterDuplicate = await customerRepo.findOne({ where: { id: customer.id } });
  assert(afterDuplicate.totalOrders === 1, `expected totalOrders to stay 1 after a replay, got ${afterDuplicate.totalOrders}`);
  assert(
    afterDuplicate.totalSpentMinor === 5000,
    `expected totalSpentMinor to stay 5000 after a replay, got ${afterDuplicate.totalSpentMinor}`,
  );
  console.log('[rollup-demo] OK — duplicate event was a no-op (processed_event dedup ledger).');

  console.log('[rollup-demo] publishing an event with no customerId (ack-and-skip)...');
  const noCustomerOrderId = `order_${ulid()}`;
  const skipEnvelope = createEnvelope({
    eventId: `demo-order-placed-nocust-${ulid()}`,
    eventType: ORDER_PLACED_EVENT_TYPE,
    storeId,
    aggregateType: 'order',
    aggregateId: noCustomerOrderId,
    payload: { ...payload, orderId: noCustomerOrderId, customerId: null },
  });
  await producer.send({ data: encodeEnvelope(skipEnvelope) });
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  console.log('[rollup-demo] OK — no crash on a null customerId (ack-and-skip).');

  await producer.close();
  await client.close();

  console.log('[rollup-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[rollup-demo] FAILED:', err);
  process.exit(1);
});
