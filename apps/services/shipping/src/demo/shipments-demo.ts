/**
 * Runnable proof — boots the real Nest application context (real
 * `ShipmentsService`, real Postgres via `shipping_db`) and exercises the
 * full lifecycle: create (draft, `SHP-<n>` display id, initial timeline
 * entry), transition through `in_progress` to `arrived`, the manual
 * event-log endpoint bumping `currentStage`, and an illegal transition
 * rejecting with 409. Same "boot the real app context, drive the real
 * services" pattern as `labels-demo.ts`.
 *
 * Run:
 *   npm run shipping:shipments-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { ShipmentsService } from '../app/shipments/shipments.service';
import { ShipmentStatus } from '../app/entities/shipment.entity';
import { ShipmentEventKind } from '../app/entities/shipment-event.entity';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const shipments = app.get(ShipmentsService);

  console.log('[shipments-demo] create() mints a SHP-<n> display id and an initial timeline entry...');
  const shipment = await shipments.create(storeId, {
    orderId: `demo-order-${ulid()}`,
    carrier: 'usps',
    destinationAddress: { postalCode: '10001' },
    contactEmail: 'buyer@example.com',
  });
  assert(shipment.displayId.startsWith('SHP-'), `unexpected displayId: ${shipment.displayId}`);
  assert(shipment.status === ShipmentStatus.Draft, 'a freshly created shipment should be a draft');
  assert(shipment.currentStage === 0, 'a freshly created shipment should be at stage 0');
  assert(shipment.events?.length === 1 && shipment.events[0].kind === ShipmentEventKind.OrderPlaced, 'create should write an order_placed timeline entry');
  console.log(`[shipments-demo] OK — ${shipment.displayId} created as a draft with its initial timeline entry.`);

  console.log('[shipments-demo] a second shipment mints the next sequence number...');
  const second = await shipments.create(storeId, { orderId: `demo-order-${ulid()}` });
  const firstN = Number(shipment.displayId.split('-')[1]);
  const secondN = Number(second.displayId.split('-')[1]);
  assert(secondN === firstN + 1, `expected sequential display ids, got ${shipment.displayId} then ${second.displayId}`);
  console.log('[shipments-demo] OK — sequence is per-store and strictly increasing.');

  console.log('[shipments-demo] an illegal transition (draft -> arrived) rejects with 409...');
  let illegalRejected = false;
  try {
    await shipments.transition(storeId, shipment.id, ShipmentStatus.Arrived);
  } catch (err) {
    illegalRejected = (err as { status?: number }).status === 409;
  }
  assert(illegalRejected, 'draft -> arrived should be illegal and reject with 409');
  console.log('[shipments-demo] OK — illegal transition rejected.');

  console.log('[shipments-demo] transitioning draft -> in_progress -> arrived...');
  const inProgress = await shipments.transition(storeId, shipment.id, ShipmentStatus.InProgress);
  assert(inProgress.status === ShipmentStatus.InProgress, 'status should now be in_progress');
  assert(inProgress.currentStage === 1, `expected currentStage 1 after confirming shipment, got ${inProgress.currentStage}`);

  const arrived = await shipments.transition(storeId, shipment.id, ShipmentStatus.Arrived);
  assert(arrived.status === ShipmentStatus.Arrived, 'status should now be arrived');
  assert(arrived.currentStage === 3, `expected currentStage 3 on arrival, got ${arrived.currentStage}`);
  assert(arrived.events?.some((e) => e.kind === ShipmentEventKind.Delivered), 'arriving should append a delivered timeline entry');
  console.log('[shipments-demo] OK — full lifecycle transitions recorded, currentStage advanced to 3.');

  console.log('[shipments-demo] transitioning past a terminal status rejects with 409...');
  let terminalRejected = false;
  try {
    await shipments.transition(storeId, shipment.id, ShipmentStatus.Canceled);
  } catch (err) {
    terminalRejected = (err as { status?: number }).status === 409;
  }
  assert(terminalRejected, 'arrived should be terminal — no further transitions');
  console.log('[shipments-demo] OK — terminal status rejected further transitions.');

  console.log('[shipments-demo] manual event log entries bump currentStage on an independent shipment...');
  const third = await shipments.create(storeId, { orderId: `demo-order-${ulid()}` });
  await shipments.addEvent(storeId, third.id, { kind: ShipmentEventKind.PickedUp });
  const afterPickup = await shipments.findOne(storeId, third.id);
  assert(afterPickup.currentStage === 1, `expected currentStage 1 after a picked_up event, got ${afterPickup.currentStage}`);
  await shipments.addEvent(storeId, third.id, { kind: ShipmentEventKind.Exception, description: 'Weather delay' });
  const afterException = await shipments.findOne(storeId, third.id);
  assert(afterException.currentStage === 1, 'an exception event should not move the stage backward or forward');
  assert(afterException.events?.length === 3, 'findOne should return every timeline entry (order_placed, picked_up, exception)');
  console.log('[shipments-demo] OK — manual events bump stage forward-only, exception logged without regressing it.');

  console.log('[shipments-demo] cancel() is a thin wrapper over transition(..., canceled)...');
  const canceled = await shipments.cancel(storeId, second.id);
  assert(canceled.status === ShipmentStatus.Canceled, 'cancel() should set status to canceled');
  console.log('[shipments-demo] OK — cancel confirmed.');

  console.log('[shipments-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[shipments-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[shipments-demo] FAILED:', err);
  process.exit(1);
});
