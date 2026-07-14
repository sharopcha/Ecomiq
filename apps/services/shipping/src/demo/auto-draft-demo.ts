/**
 * Runnable proof — boots the real hybrid app (Pulsar consumers active,
 * including the new cross-namespace `order.events` subscription) and
 * exercises a synthetic `orders.order.placed` event: a draft shipment
 * auto-creates with the destination/contact snapshot from the payload, and
 * a duplicate event for the same order is a no-op (idempotent on
 * `order_id`). Same "publish a synthetic event onto the live topic, wait
 * for the real consumer to react" pattern as notification's
 * `return-approved-demo.ts`.
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack).
 *
 * Run:
 *   npm run shipping:auto-draft-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { PulsarServer, createEnvelope, encodeEnvelope } from '@temp-nx/pulsar';
import { AppModule } from '../app/app.module';
import { Shipment } from '../app/entities/shipment.entity';
import { ORDER_PLACED_EVENT_TYPE, OrderPlacedPayload } from '../app/order-events/order-placed-event-payload';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[auto-draft-demo] ASSERTION FAILED: ${message}`);
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
      throw new Error(`[auto-draft-demo] timed out waiting for condition after ${timeoutMs}ms`);
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
      subscription: 'order-events::shipping-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.init();
  await app.startAllMicroservices();

  const storeId = `demo-store-${ulid()}`;
  const shipmentRepo = app.get<Repository<Shipment>>(getRepositoryToken(Shipment));

  const orderId = `order_${ulid()}`;
  const payload: OrderPlacedPayload = {
    orderId,
    storeId,
    customerId: null,
    discountId: null,
    discountMinor: 0,
    subtotalMinor: 5000,
    totalMinor: 5000,
    currency: 'USD',
    shippingAddress: { street: '1 Infinite Loop', city: 'Cupertino', postalCode: '95014', countryCode: 'US' },
    contactEmail: 'ada@example.com',
    lines: [],
  };

  console.log('[auto-draft-demo] publishing a synthetic orders.order.placed event onto a live order.events topic...');
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

  console.log('[auto-draft-demo] waiting for the real consumer to auto-draft a shipment (up to 30s)...');
  const shipment = await waitUntil(
    () => shipmentRepo.findOne({ where: { storeId, orderId } }),
    () => true,
    30_000,
  );
  assert(shipment.displayId.startsWith('SHP-'), `unexpected displayId: ${shipment.displayId}`);
  assert(shipment.status === 'draft', 'auto-drafted shipment should be a draft');
  assert(
    (shipment.destinationAddress as Record<string, unknown> | null)?.['city'] === 'Cupertino',
    'destinationAddress should snapshot the event payload\'s shippingAddress',
  );
  assert(shipment.contactEmail === 'ada@example.com', 'contactEmail should snapshot the event payload');
  console.log(`[auto-draft-demo] OK — ${shipment.displayId} auto-drafted with the right destination + contact.`);

  console.log('[auto-draft-demo] publishing a duplicate event for the same order...');
  const duplicateEnvelope = createEnvelope({
    eventId: `demo-order-placed-dup-${ulid()}`,
    eventType: ORDER_PLACED_EVENT_TYPE,
    storeId,
    aggregateType: 'order',
    aggregateId: orderId,
    payload,
  });
  await producer.send({ data: encodeEnvelope(duplicateEnvelope) });
  // No positive signal to wait on for a no-op — give the consumer a beat to
  // (not) process it, then assert only one shipment exists for the order.
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const countRows = await shipmentRepo.count({ where: { storeId, orderId } });
  assert(countRows === 1, `expected exactly one shipment for the order after a duplicate event, got ${countRows}`);
  console.log('[auto-draft-demo] OK — duplicate event was a no-op, still exactly one shipment.');

  await producer.close();
  await client.close();

  console.log('[auto-draft-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[auto-draft-demo] FAILED:', err);
  process.exit(1);
});
