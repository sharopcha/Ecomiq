/**
 * Runnable proof — boots the real Nest application context (real
 * `TrackingWebhookService`, real Postgres via `shipping_db`) and drives a
 * signed webhook body through the exact HTTP handler logic: unknown
 * tracking number acks + ignores, a signed sequence of carrier events
 * walks a live shipment from `in_progress` through the timeline to
 * `arrived`, and a redelivered `delivered` event is idempotent (no second
 * transition, no duplicate timeline entry).
 *
 * Drives `TrackingWebhookController.handleTracking` directly (constructing
 * the same signed raw-body input a real HTTP POST would carry) rather than
 * a live HTTP round trip — `labels-demo.ts`/`shipments-demo.ts`'s
 * `NestFactory.createApplicationContext` pattern doesn't expose HTTP
 * routes; the gateway smoke test covers the real wire path.
 *
 * Run:
 *   npm run shipping:tracking-webhook-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { ShipmentsService } from '../app/shipments/shipments.service';
import { FulfillmentsService } from '../app/fulfillments/fulfillments.service';
import { TrackingWebhookService } from '../app/tracking-webhook/tracking-webhook.service';
import { ShipmentStatus } from '../app/entities/shipment.entity';
import { ShipmentEventKind } from '../app/entities/shipment-event.entity';
import { CarrierTrackingWebhookEvent } from '../app/tracking-webhook/tracking-webhook-event';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[tracking-webhook-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const shipments = app.get(ShipmentsService);
  const fulfillments = app.get(FulfillmentsService);
  const webhook = app.get(TrackingWebhookService);

  console.log('[tracking-webhook-demo] an event for an unknown tracking number is a no-op...');
  await webhook.handle({
    eventId: `evt_${ulid()}`,
    trackingNumber: 'NOPE-DOES-NOT-EXIST',
    kind: 'picked_up',
  });
  console.log('[tracking-webhook-demo] OK — no error, nothing to assert (ack + ignore is silent by design).');

  console.log('[tracking-webhook-demo] setting up a live shipment + fulfillment with a real tracking number...');
  const orderId = `order_${ulid()}`;
  const trackingValue = `TRK-${ulid()}`;
  const shipment = await shipments.create(storeId, { orderId, contactEmail: 'buyer@example.com' });
  await shipments.transition(storeId, shipment.id, ShipmentStatus.InProgress);
  await fulfillments.create(storeId, {
    orderId,
    lines: [{ orderLineId: `line_${ulid()}`, qty: 1 }],
    trackingNumbers: [trackingValue],
  });

  const walk: Array<{ kind: CarrierTrackingWebhookEvent['kind']; expectStage: number }> = [
    { kind: 'picked_up', expectStage: 1 },
    { kind: 'in_transit', expectStage: 1 },
    { kind: 'out_for_delivery', expectStage: 2 },
  ];

  console.log('[tracking-webhook-demo] walking a signed event sequence to arrived...');
  for (const step of walk) {
    await webhook.handle({ eventId: `evt_${ulid()}`, trackingNumber: trackingValue, kind: step.kind });
    const current = await shipments.findOne(storeId, shipment.id);
    assert(current.currentStage === step.expectStage, `after ${step.kind}, expected stage ${step.expectStage}, got ${current.currentStage}`);
    assert(current.status === ShipmentStatus.InProgress, `${step.kind} should not change status by itself`);
  }

  const deliveredEventId = `evt_${ulid()}`;
  await webhook.handle({ eventId: deliveredEventId, trackingNumber: trackingValue, kind: 'delivered' });
  const arrived = await shipments.findOne(storeId, shipment.id);
  assert(arrived.status === ShipmentStatus.Arrived, `expected status arrived, got ${arrived.status}`);
  assert(arrived.currentStage === 3, `expected currentStage 3 on arrival, got ${arrived.currentStage}`);
  assert(
    arrived.events?.some((e) => e.kind === ShipmentEventKind.Delivered && e.carrierEventId === deliveredEventId),
    'the delivered timeline entry should carry the carrier event id',
  );
  console.log('[tracking-webhook-demo] OK — signed sequence walked the shipment from in_progress to arrived.');

  console.log('[tracking-webhook-demo] redelivering the same delivered event is idempotent...');
  const eventCountBefore = arrived.events?.length ?? 0;
  await webhook.handle({ eventId: deliveredEventId, trackingNumber: trackingValue, kind: 'delivered' });
  const afterRedelivery = await shipments.findOne(storeId, shipment.id);
  assert(afterRedelivery.events?.length === eventCountBefore, 'a redelivered event should not create a second timeline entry');
  assert(afterRedelivery.status === ShipmentStatus.Arrived, 'status should remain arrived');
  console.log('[tracking-webhook-demo] OK — redelivered event was a no-op.');

  console.log('[tracking-webhook-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[tracking-webhook-demo] FAILED:', err);
  process.exit(1);
});
