/**
 * Runnable proof — boots the real Nest application context (real
 * `TrackingService`, real Postgres via `shipping_db`, real Redis) and
 * drives `TrackingService.getPublicTracking` directly: lookup by display
 * id and by tracking number both resolve the same shipment, the response
 * strips PII (no `contactEmail`/`orderId`/street address anywhere in the
 * serialized output), an unknown id 404s, and the 60s cache genuinely
 * serves a stale snapshot until the key is cleared.
 *
 * Drives the service directly rather than a live HTTP round trip — same
 * `NestFactory.createApplicationContext` precedent as
 * `tracking-webhook-demo.ts`; throttle-guard behavior (the other half of
 * this step) is proven by the live gateway curl smoke test, not here.
 *
 * Run:
 *   npm run shipping:tracking-page-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type Redis from 'ioredis';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { ShipmentsService } from '../app/shipments/shipments.service';
import { FulfillmentsService } from '../app/fulfillments/fulfillments.service';
import { TrackingService } from '../app/tracking/tracking.service';
import { REDIS_CLIENT } from '../app/redis/redis.constants';
import { ShipmentStatus } from '../app/entities/shipment.entity';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[tracking-page-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const shipments = app.get(ShipmentsService);
  const fulfillments = app.get(FulfillmentsService);
  const tracking = app.get(TrackingService);
  const redis = app.get<Redis>(REDIS_CLIENT);

  console.log('[tracking-page-demo] setting up a live shipment with a destination address + fulfillment tracking number...');
  const orderId = `order_${ulid()}`;
  const trackingValue = `TRK-${ulid()}`;
  const shipment = await shipments.create(storeId, {
    orderId,
    contactEmail: 'buyer@example.com',
    destinationAddress: { city: 'New York', street: '350 5th Ave', postalCode: '10001' },
  });
  await shipments.transition(storeId, shipment.id, ShipmentStatus.InProgress);
  await fulfillments.create(storeId, {
    orderId,
    lines: [{ orderLineId: `line_${ulid()}`, qty: 1 }],
    trackingNumbers: [trackingValue],
  });

  console.log('[tracking-page-demo] looking up by display id...');
  const byDisplayId = await tracking.getPublicTracking(storeId, shipment.displayId);
  assert(byDisplayId.status === ShipmentStatus.InProgress, `expected in_progress, got ${byDisplayId.status}`);
  assert(byDisplayId.destinationCity === 'New York', `expected destinationCity New York, got ${byDisplayId.destinationCity}`);
  console.log('[tracking-page-demo] OK — resolved by display id.');

  console.log('[tracking-page-demo] verifying no PII anywhere in the serialized response...');
  const serialized = JSON.stringify(byDisplayId);
  assert(!serialized.includes('buyer@example.com'), 'contactEmail leaked into the public response');
  assert(!serialized.includes(orderId), 'orderId leaked into the public response');
  assert(!serialized.includes('350 5th Ave'), 'street address leaked into the public response');
  console.log('[tracking-page-demo] OK — PII stripped.');

  console.log('[tracking-page-demo] clearing the cache, then looking up the same shipment by tracking number...');
  await redis.del(`shipping:track:${storeId}:${shipment.displayId}`);
  const byTrackingNumber = await tracking.getPublicTracking(storeId, trackingValue);
  assert(byTrackingNumber.destinationCity === 'New York', 'tracking-number lookup should resolve the same shipment');
  console.log('[tracking-page-demo] OK — resolved by tracking number.');

  console.log('[tracking-page-demo] an unknown display id 404s...');
  let notFoundThrew = false;
  try {
    await tracking.getPublicTracking(storeId, 'SHP-DOES-NOT-EXIST');
  } catch {
    notFoundThrew = true;
  }
  assert(notFoundThrew, 'an unknown display id should throw NotFoundException');
  console.log('[tracking-page-demo] OK — 404 on unknown id.');

  console.log('[tracking-page-demo] proving the 60s cache actually serves a stale snapshot...');
  await redis.del(`shipping:track:${storeId}:${trackingValue}`);
  const freshBeforeArrival = await tracking.getPublicTracking(storeId, trackingValue);
  assert(freshBeforeArrival.status === ShipmentStatus.InProgress, 'expected in_progress before the underlying transition');
  await shipments.transition(storeId, shipment.id, ShipmentStatus.Arrived);
  const stillCached = await tracking.getPublicTracking(storeId, trackingValue);
  assert(stillCached.status === ShipmentStatus.InProgress, 'cache should still serve the stale in_progress snapshot within the 60s TTL');
  await redis.del(`shipping:track:${storeId}:${trackingValue}`);
  const freshAfterInvalidation = await tracking.getPublicTracking(storeId, trackingValue);
  assert(freshAfterInvalidation.status === ShipmentStatus.Arrived, 'clearing the cache key should surface the real current status');
  console.log('[tracking-page-demo] OK — cache genuinely serves a stale snapshot until cleared.');

  console.log('[tracking-page-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[tracking-page-demo] FAILED:', err);
  process.exit(1);
});
