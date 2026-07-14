/**
 * Runnable proof — boots the real Nest application context (real
 * `ShipmentNotifyService`, real Postgres via `shipping_db`) and exercises
 * the Shipment Notification composer: records a `queued` row and emits
 * `notify.send` (`template: 'shipment'`) onto marketing's `notify.commands`
 * topic via an explicit outbox topic override.
 *
 * Run:
 *   npm run shipping:shipment-notify-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { ShipmentsService } from '../app/shipments/shipments.service';
import { ShipmentNotifyService } from '../app/shipment-notify/shipment-notify.service';
import { NotifChannel } from '../app/entities/shipment-notification.entity';
import { NOTIFY_SEND_COMMAND } from '../app/events/shipping-event-types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[shipment-notify-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const shipments = app.get(ShipmentsService);
  const notify = app.get(ShipmentNotifyService);
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));

  console.log('[shipment-notify-demo] composing a notification for a real shipment...');
  const shipment = await shipments.create(storeId, { orderId: `order_${ulid()}` });
  const notification = await notify.create(storeId, shipment.id, {
    channel: NotifChannel.Email,
    toAddress: 'buyer@example.com',
    subject: 'Your order has shipped',
    body: 'Track your package at ...',
  });
  assert(notification.status === 'queued', `expected status queued, got ${notification.status}`);
  assert(notification.toAddress === 'buyer@example.com', 'toAddress should round-trip');
  console.log('[shipment-notify-demo] OK — row recorded as queued.');

  console.log('[shipment-notify-demo] notify.send was queued with the shipment template + topic override...');
  const outboxRow = await outboxRepo.findOne({
    where: { eventType: NOTIFY_SEND_COMMAND, aggregateId: notification.id },
  });
  assert(!!outboxRow, 'notify.send should be recorded on the outbox');
  assert(
    outboxRow!.topic === 'persistent://ecomiq/marketing/notify.commands',
    `unexpected topic override: ${outboxRow!.topic}`,
  );
  const payload = outboxRow!.payload as { template: string; shipmentId: string; to: string };
  assert(payload.template === 'shipment', 'notify.send payload should use the shipment template');
  assert(payload.shipmentId === shipment.id, 'payload should reference the shipment');
  assert(payload.to === 'buyer@example.com', 'payload should carry the composer recipient');
  console.log('[shipment-notify-demo] OK — notify.send queued with the shipment template.');

  console.log('[shipment-notify-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[shipment-notify-demo] FAILED:', err);
  process.exit(1);
});
