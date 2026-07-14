/**
 * Runnable proof — boots the real hybrid app (both Pulsar consumers
 * active, including the new self-consumed `shipment-delay::shipping-service`
 * subscription) and exercises delay detection: a shipment transitioned to
 * `in_progress` with a near-future `expectedArrivalAt` genuinely flips to
 * delayed once the real delayed message lands (seconds-scale, not the
 * realistic days-scale a live store would use — `expectedArrivalAt` is
 * arbitrary caller input, so the override needs no special env var); a
 * shipment that reaches `arrived` before the delayed message fires is a
 * silent no-op; and the manual `POST /:id/delay` path is idempotent.
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack).
 *
 * Run:
 *   npm run shipping:delay-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { PulsarServer } from '@temp-nx/pulsar';
import { AppModule } from '../app/app.module';
import { ShipmentsService } from '../app/shipments/shipments.service';
import { ShipmentStatus } from '../app/entities/shipment.entity';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[delay-demo] ASSERTION FAILED: ${message}`);
  }
}

async function waitUntil<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  intervalMs = 500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (predicate(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(`[delay-demo] timed out waiting for condition after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.SHIPPING_PULSAR_NAMESPACE || 'shipping',
      aggregates: ['shipment'],
      subscription: 'shipment-delay::shipping-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.init();
  await app.startAllMicroservices();

  const storeId = `demo-store-${ulid()}`;
  const shipments = app.get(ShipmentsService);

  console.log('[delay-demo] transitioning a shipment to in_progress with a 3s expectedArrivalAt arms the real delay check...');
  const shipment = await shipments.create(storeId, {
    orderId: `order_${ulid()}`,
    expectedArrivalAt: new Date(Date.now() + 3_000).toISOString(),
  });
  const inProgress = await shipments.transition(storeId, shipment.id, ShipmentStatus.InProgress);
  assert(inProgress.isDelayed === false, 'should not be delayed immediately after transitioning');

  console.log('[delay-demo] waiting for the real delayed message to land (up to 30s)...');
  const delayed = await waitUntil(
    () => shipments.findOne(storeId, shipment.id),
    (s) => s.isDelayed === true,
    30_000,
  );
  assert(delayed.delayReason === 'Expected arrival passed', `unexpected delayReason: ${delayed.delayReason}`);
  assert(delayed.status === ShipmentStatus.InProgress, 'delay should not change status');
  console.log('[delay-demo] OK — genuine delayed message flipped the shipment to delayed.');

  console.log('[delay-demo] a shipment that reaches arrived before the delay check fires is a silent no-op...');
  const arrivedFirst = await shipments.create(storeId, {
    orderId: `order_${ulid()}`,
    expectedArrivalAt: new Date(Date.now() + 3_000).toISOString(),
  });
  await shipments.transition(storeId, arrivedFirst.id, ShipmentStatus.InProgress);
  await shipments.transition(storeId, arrivedFirst.id, ShipmentStatus.Arrived);
  // No positive signal to wait on for a no-op — the delay check landing at
  // ~3s and finding the shipment already arrived is exactly what we're
  // proving; give it time to land, then assert it never flipped isDelayed.
  await new Promise((resolve) => setTimeout(resolve, 6_000));
  const stillArrived = await shipments.findOne(storeId, arrivedFirst.id);
  assert(stillArrived.isDelayed === false, 'a shipment that arrived before the delay check fired should never be marked delayed');
  assert(stillArrived.status === ShipmentStatus.Arrived, 'status should remain arrived');
  console.log('[delay-demo] OK — delay check silently no-opped on an already-arrived shipment.');

  console.log('[delay-demo] manual delay path is idempotent...');
  const manual = await shipments.create(storeId, { orderId: `order_${ulid()}` });
  await shipments.transition(storeId, manual.id, ShipmentStatus.InProgress);
  const firstDelay = await shipments.delay(storeId, manual.id, 'Customs hold');
  assert(firstDelay.isDelayed === true && firstDelay.delayReason === 'Customs hold', 'manual delay should set isDelayed + the given reason');

  const secondDelay = await shipments.delay(storeId, manual.id, 'A different reason');
  assert(secondDelay.delayReason === 'Customs hold', 'an already-delayed shipment should keep its original reason (idempotent no-op)');
  console.log('[delay-demo] OK — manual delay set the reason once, a second call was a no-op.');

  console.log('[delay-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[delay-demo] FAILED:', err);
  process.exit(1);
});
