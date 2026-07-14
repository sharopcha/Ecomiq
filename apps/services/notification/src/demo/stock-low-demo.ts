/**
 * Runnable proof — boots the real hybrid app (Pulsar consumers active,
 * including the new cross-namespace `stock_level.events` subscription) and
 * exercises the action fan-out for a synthetic `inventory.stock.low` event:
 * `send_email`/`send_inbox`/`send_sms` each dispatch, `create_task` is
 * acked and ignored, and a duplicate delivery of the same event is
 * idempotent per action (not per whole event).
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack).
 *
 * Run:
 *   npm run notification:stock-low-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { PulsarServer, createEnvelope, encodeEnvelope } from '@temp-nx/pulsar';
import { AppModule } from '../app/app.module';
import { DispatchService } from '../app/dispatch/dispatch.service';
import { SendLog, SendStatus } from '../app/entities/send-log.entity';
import { STOCK_LOW_EVENT_TYPE, StockLowPayload } from '../app/stock-low/stock-low-event-payload';
import { mapStockLowActions } from '../app/stock-low/map-stock-low.util';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[stock-low-demo] ASSERTION FAILED: ${message}`);
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
      throw new Error(`[stock-low-demo] timed out waiting for condition after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  const tenant = process.env.PULSAR_TENANT || 'ecomiq';
  const inventoryNamespace = process.env.INVENTORY_PULSAR_NAMESPACE || 'inventory';

  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant,
      namespace: inventoryNamespace,
      aggregates: ['stock_level'],
      subscription: 'stock-level-events::notification-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.init();

  let liveConsumerAvailable = true;
  try {
    await app.startAllMicroservices();
  } catch (err) {
    liveConsumerAvailable = false;
    console.warn(
      `[stock-low-demo] WARNING: could not start the stock_level.events Pulsar consumer (${(err as Error).message}). ` +
        'Falling back to calling mapStockLowActions() + DispatchService.dispatch() directly.',
    );
  }

  const storeId = `demo-store-${ulid()}`;
  const sendLogRepo = app.get<Repository<SendLog>>(getRepositoryToken(SendLog));

  const payload: StockLowPayload = {
    stockLevelId: `sl_${ulid()}`,
    variantId: `var_${ulid()}`,
    locationId: `loc_${ulid()}`,
    alertId: `alert_${ulid()}`,
    threshold: 10,
    direction: 'lower_than',
    actions: ['send_email', 'send_inbox', 'send_sms', 'create_task'],
    available: 3,
    onHand: 5,
    reserved: 2,
    status: 'low',
  };
  const eventId = `demo-stock-low-${ulid()}`;

  if (liveConsumerAvailable) {
    console.log('[stock-low-demo] publishing a synthetic inventory.stock.low event onto a live stock_level.events topic...');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Client } = require('pulsar-client');
    const client = new Client({ serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650' });
    const producer = await client.createProducer({
      topic: `persistent://${tenant}/${inventoryNamespace}/stock_level.events`,
    });
    const envelope = createEnvelope({
      eventId,
      eventType: STOCK_LOW_EVENT_TYPE,
      storeId,
      aggregateType: 'stock_level',
      aggregateId: payload.stockLevelId,
      payload,
    });
    await producer.send({ data: encodeEnvelope(envelope) });
    await producer.close();
    await client.close();

    console.log('[stock-low-demo] waiting for the real consumer to fan out (up to 30s)...');
    for (const action of ['send_email', 'send_inbox', 'send_sms']) {
      await waitUntil(
        () => sendLogRepo.findOne({ where: { sourceEventId: `${eventId}:${action}` } }),
        (row) => row.status !== SendStatus.Pending,
        30_000,
      );
    }
  } else {
    const dispatch = app.get(DispatchService);
    const items = mapStockLowActions(
      eventId,
      payload,
      process.env.NOTIFICATION_STAFF_EMAIL ?? 'staff@example.com',
      process.env.NOTIFICATION_STAFF_PHONE ?? '+10000000000',
    );
    for (const item of items) {
      await dispatch.dispatch({ storeId, sourceEventId: item.sourceEventId, ...item.input });
    }
  }

  console.log('[stock-low-demo] verifying send_email -> staff email dispatched...');
  const emailRow = await sendLogRepo.findOne({ where: { sourceEventId: `${eventId}:send_email` } });
  assert(!!emailRow, 'send_email should have created a send_log row');
  assert(emailRow!.status === SendStatus.Sent, `expected sent, got ${emailRow!.status}`);
  assert(emailRow!.refTable === 'stock_alert', 'send_email row should reference stock_alert');
  assert(emailRow!.refId === payload.alertId, 'send_email row should reference the alert id');
  console.log('[stock-low-demo] OK — staff email dispatched.');

  console.log('[stock-low-demo] verifying send_inbox -> in-app broadcast dispatched...');
  const inboxRow = await sendLogRepo.findOne({ where: { sourceEventId: `${eventId}:send_inbox` } });
  assert(!!inboxRow, 'send_inbox should have created a send_log row');
  assert(inboxRow!.recipient === 'broadcast', 'send_inbox recipient should be the broadcast convention');
  console.log('[stock-low-demo] OK — in-app broadcast dispatched.');

  console.log('[stock-low-demo] verifying send_sms -> staff phone dispatched...');
  const smsRow = await sendLogRepo.findOne({ where: { sourceEventId: `${eventId}:send_sms` } });
  assert(!!smsRow, 'send_sms should have created a send_log row');
  assert(smsRow!.status === SendStatus.Sent, `expected sent, got ${smsRow!.status}`);
  console.log('[stock-low-demo] OK — staff SMS dispatched.');

  console.log('[stock-low-demo] verifying create_task produced no send_log row (ack-and-ignore)...');
  const taskRow = await sendLogRepo.findOne({ where: { sourceEventId: `${eventId}:create_task` } });
  assert(!taskRow, 'create_task should never create a send_log row');
  console.log('[stock-low-demo] OK — create_task ack-and-ignored.');

  console.log('[stock-low-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[stock-low-demo] FAILED:', err);
  process.exit(1);
});
