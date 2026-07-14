/**
 * Runnable proof — boots the real Nest application context (real
 * `PickupsService`, real Postgres via `shipping_db`) and exercises the
 * bulk Schedule Pickup flow: two rows in one call, each getting its own
 * `shipping.pickup.scheduled` outbox row and a `deliverAt`-armed
 * `shipping.pickup.reminder_check`; a still-`scheduled` pickup's reminder
 * check emits `notify.send` (`template: 'pickup_reminder'`); a
 * `completed`/`canceled` pickup's reminder check is a no-op.
 *
 * Run:
 *   npm run shipping:pickups-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { ShipmentsService } from '../app/shipments/shipments.service';
import { PickupsService } from '../app/pickups/pickups.service';
import { Pickup, PickupStatus } from '../app/entities/pickup.entity';
import { NOTIFY_SEND_COMMAND } from '../app/events/shipping-event-types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[pickups-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const shipments = app.get(ShipmentsService);
  const pickups = app.get(PickupsService);
  const pickupRepo = app.get<Repository<Pickup>>(getRepositoryToken(Pickup));
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));

  console.log('[pickups-demo] bulk-scheduling pickups for two shipments...');
  const shipmentA = await shipments.create(storeId, { orderId: `order_${ulid()}` });
  const shipmentB = await shipments.create(storeId, { orderId: `order_${ulid()}` });

  const scheduled = await pickups.scheduleBulk(storeId, [
    { shipmentId: shipmentA.id, carrier: 'usps', pickupDate: '2026-08-01', pickupTime: '10:00', note: 'Front desk' },
    { shipmentId: shipmentB.id, carrier: 'fedex', pickupDate: '2026-08-02' },
  ]);
  assert(scheduled.length === 2, `expected 2 scheduled pickups, got ${scheduled.length}`);
  assert(scheduled.every((p) => p.status === PickupStatus.Scheduled), 'every pickup should start scheduled');
  console.log('[pickups-demo] OK — 2 pickups created.');

  console.log('[pickups-demo] each row got its own shipping.pickup.scheduled + reminder_check outbox rows...');
  for (const pickup of scheduled) {
    const scheduledRow = await outboxRepo.findOne({
      where: { eventType: 'shipping.pickup.scheduled', aggregateId: pickup.id },
    });
    assert(!!scheduledRow, `missing shipping.pickup.scheduled outbox row for pickup ${pickup.id}`);

    const reminderRow = await outboxRepo.findOne({
      where: { eventType: 'shipping.pickup.reminder_check', aggregateId: pickup.id },
    });
    assert(!!reminderRow, `missing shipping.pickup.reminder_check outbox row for pickup ${pickup.id}`);
    assert(!!reminderRow!.deliverAt, 'reminder_check should carry a deliverAt');
  }
  console.log('[pickups-demo] OK — outbox rows present for both pickups.');

  console.log('[pickups-demo] a still-scheduled pickup\'s reminder check emits notify.send...');
  const [pickupA] = scheduled;
  await pickups.handleReminderCheck(storeId, pickupA.id);
  const notifyRow = await outboxRepo.findOne({ where: { eventType: NOTIFY_SEND_COMMAND, aggregateId: pickupA.id } });
  assert(!!notifyRow, 'notify.send should be recorded for a scheduled pickup');
  assert(notifyRow!.topic === 'persistent://ecomiq/marketing/notify.commands', `unexpected topic: ${notifyRow!.topic}`);
  const notifyPayload = notifyRow!.payload as { template: string };
  assert(notifyPayload.template === 'pickup_reminder', 'notify.send payload should use the pickup_reminder template');
  console.log('[pickups-demo] OK — notify.send queued with the pickup_reminder template.');

  console.log('[pickups-demo] a completed pickup\'s reminder check is a no-op...');
  const [, pickupB] = scheduled;
  await pickupRepo.update({ id: pickupB.id }, { status: PickupStatus.Completed });
  await pickups.handleReminderCheck(storeId, pickupB.id);
  const noNotifyRow = await outboxRepo.findOne({ where: { eventType: NOTIFY_SEND_COMMAND, aggregateId: pickupB.id } });
  assert(!noNotifyRow, 'a completed pickup should never emit notify.send');
  console.log('[pickups-demo] OK — no notify.send for a completed pickup.');

  console.log('[pickups-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[pickups-demo] FAILED:', err);
  process.exit(1);
});
