/**
 * Runnable proof — boots the real Nest application context (real
 * `FulfillmentsService`, real Postgres via `shipping_db`) and exercises
 * fulfillment creation: lines + 1..n tracking numbers persist, linking
 * `shipment.fulfillment_id` when a shipment for the order exists, and
 * `notify_customer=true` emits a `notify.send` command onto marketing's
 * `notify.commands` topic (verified via the outbox row directly — no
 * consumer for it exists yet).
 *
 * Run:
 *   npm run shipping:fulfillment-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { FulfillmentsService } from '../app/fulfillments/fulfillments.service';
import { ShipmentsService } from '../app/shipments/shipments.service';
import { NOTIFY_SEND_COMMAND } from '../app/events/shipping-event-types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[fulfillment-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const fulfillments = app.get(FulfillmentsService);
  const shipments = app.get(ShipmentsService);
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));

  console.log('[fulfillment-demo] fulfilling an order with no existing shipment...');
  const orderIdNoShipment = `order_${ulid()}`;
  const bareFulfillment = await fulfillments.create(storeId, {
    orderId: orderIdNoShipment,
    lines: [{ orderLineId: `line_${ulid()}`, qty: 2 }],
    trackingNumbers: ['9400110200882095400825'],
  });
  assert(bareFulfillment.lines?.length === 1, 'fulfillment should carry its line');
  assert(bareFulfillment.trackingNumbers?.length === 1, 'fulfillment should carry its tracking number');
  console.log('[fulfillment-demo] OK — fulfillment created with lines + tracking numbers.');

  console.log('[fulfillment-demo] fulfilling an order that has a shipment links shipment.fulfillment_id...');
  const orderId = `order_${ulid()}`;
  const shipment = await shipments.create(storeId, { orderId, contactEmail: 'buyer@example.com' });
  const fulfillment = await fulfillments.create(storeId, {
    orderId,
    lines: [
      { orderLineId: `line_${ulid()}`, qty: 1 },
      { orderLineId: `line_${ulid()}`, qty: 3 },
    ],
    trackingNumbers: ['1Z999AA10123456784', '1Z999AA10123456785'],
    notifyCustomer: true,
  });
  assert(fulfillment.lines?.length === 2, 'fulfillment should carry both lines');
  assert(fulfillment.trackingNumbers?.length === 2, 'fulfillment should carry both tracking numbers');

  const linked = await shipments.findOne(storeId, shipment.id);
  assert(linked.fulfillmentId === fulfillment.id, 'shipment.fulfillmentId should link to the new fulfillment');
  console.log('[fulfillment-demo] OK — shipment.fulfillmentId linked.');

  console.log('[fulfillment-demo] shipping.fulfillment.created outbox row carries per-line quantities...');
  const createdOutbox = await outboxRepo.findOne({
    where: { eventType: 'shipping.fulfillment.created', aggregateId: fulfillment.id },
  });
  assert(!!createdOutbox, 'shipping.fulfillment.created should be recorded on the outbox');
  const createdPayload = createdOutbox!.payload as { lines: Array<{ orderLineId: string; qty: number }> };
  assert(createdPayload.lines.length === 2, 'outbox payload should carry both line quantities');
  console.log('[fulfillment-demo] OK — outbox event payload carries line quantities.');

  console.log('[fulfillment-demo] notify_customer=true emits a notify.send command with an explicit topic override...');
  const notifyOutbox = await outboxRepo.findOne({
    where: { eventType: NOTIFY_SEND_COMMAND, aggregateId: fulfillment.id },
  });
  assert(!!notifyOutbox, 'notify.send should be recorded on the outbox for notifyCustomer=true');
  assert(notifyOutbox!.topic === 'persistent://ecomiq/marketing/notify.commands', `unexpected topic override: ${notifyOutbox!.topic}`);
  const notifyPayload = notifyOutbox!.payload as { template: string; email: string | null };
  assert(notifyPayload.template === 'shipment', 'notify.send payload should use the shipment template');
  assert(notifyPayload.email === 'buyer@example.com', "notify.send payload should carry the linked shipment's contactEmail");
  console.log('[fulfillment-demo] OK — notify.send command queued with the shipment template + topic override.');

  console.log('[fulfillment-demo] the bare fulfillment (no notifyCustomer) emitted no notify.send command...');
  const noNotify = await outboxRepo.findOne({
    where: { eventType: NOTIFY_SEND_COMMAND, aggregateId: bareFulfillment.id },
  });
  assert(!noNotify, 'notifyCustomer defaulting to false should never emit a notify.send command');
  console.log('[fulfillment-demo] OK.');

  console.log('[fulfillment-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[fulfillment-demo] FAILED:', err);
  process.exit(1);
});
