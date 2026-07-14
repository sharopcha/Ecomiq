/**
 * Runnable proof — the integration proof for Step 7. Boots the real hybrid
 * app (both Pulsar consumer connections active, same as main.ts) and
 * exercises `notify.send` command handling for all three payload shapes
 * that exist in this repo today (campaign, refund, refund_failed_staff_alert)
 * plus `sendToCustomer===false` and an unknown `template` value, over a
 * *live* Pulsar broker — synthetic commands published directly onto
 * marketing's `notify.commands` topic, exactly as marketing-service's own
 * campaign fire / order-service's refund settlement would.
 *
 * Falls back to calling the mapper + `DispatchService.dispatch()` directly
 * (bypassing the Pulsar transport hop) if the live consumer can't start —
 * same resilience pattern `dispatch-demo.ts` uses, for the same
 * pre-existing Pulsar-broker reason.
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack).
 *
 * Run:
 *   npm run notification:commands-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { PulsarServer, createEnvelope, encodeEnvelope, topicForCommands } from '@temp-nx/pulsar';
import { AppModule } from '../app/app.module';
import { DispatchService } from '../app/dispatch/dispatch.service';
import { mapNotifyCommand } from '../app/notify-commands/map-notify-command.util';
import { SendLog, SendStatus } from '../app/entities/send-log.entity';

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
      throw new Error(`[commands-demo] timed out waiting for condition after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[commands-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  const tenant = process.env.PULSAR_TENANT || 'ecomiq';
  const marketingNamespace = process.env.MARKETING_PULSAR_NAMESPACE || 'marketing';

  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant,
      namespace: process.env.NOTIFICATION_PULSAR_NAMESPACE || 'notify',
      aggregates: ['message'],
      subscription: 'message-retry::notification-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant,
      namespace: marketingNamespace,
      aggregates: [],
      topics: [topicForCommands(tenant, marketingNamespace, 'notify')],
      subscription: 'notify-commands::notification-service',
      subscriptionType: 'Shared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // `NestFactory.create()` alone does NOT run `onModuleInit` lifecycle
  // hooks (normally triggered by `.listen()`) — without an explicit
  // `app.init()`, `OutboxRelayService.onModuleInit()` never fires, so
  // nothing in this service's own outbox ever gets relayed to Pulsar. This
  // demo has no HTTP to listen on, so `.init()` directly, not `.listen()`.
  await app.init();

  let liveConsumerAvailable = true;
  try {
    await app.startAllMicroservices();
  } catch (err) {
    liveConsumerAvailable = false;
    console.warn(
      `[commands-demo] WARNING: could not start the Pulsar consumers (${(err as Error).message}). ` +
        'Falling back to calling the mapper + DispatchService.dispatch() directly instead of publishing onto a live topic.',
    );
  }

  const storeId = `demo-store-${ulid()}`;
  const sendLogRepo = app.get<Repository<SendLog>>(getRepositoryToken(SendLog));
  const dispatch = app.get(DispatchService);

  const campaignEventId = `demo-cmd-campaign-${ulid()}`;
  const refundEventId = `demo-cmd-refund-${ulid()}`;
  const refundSkippedEventId = `demo-cmd-refund-skip-${ulid()}`;
  const staffAlertEventId = `demo-cmd-staffalert-${ulid()}`;
  const unknownEventId = `demo-cmd-unknown-${ulid()}`;

  const commands: Array<{ eventId: string; payload: Record<string, unknown> }> = [
    {
      eventId: campaignEventId,
      payload: {
        template: 'campaign',
        campaignId: 'demo-campaign',
        sendId: 'demo-send-1',
        recipient: 'ada@example.com',
        content: { subject: 'Big Sale' },
      },
    },
    {
      eventId: refundEventId,
      payload: {
        template: 'refund',
        orderId: 'demo-order-1',
        refundId: 'demo-refund-1',
        amountMinor: 1500,
        sendToCustomer: true,
        message: 'Sorry for the trouble!',
        email: 'ada@example.com',
      },
    },
    {
      eventId: refundSkippedEventId,
      payload: {
        template: 'refund',
        orderId: 'demo-order-2',
        refundId: 'demo-refund-2',
        amountMinor: 500,
        sendToCustomer: false,
        email: 'ada@example.com',
      },
    },
    {
      eventId: staffAlertEventId,
      payload: {
        template: 'refund_failed_staff_alert',
        orderId: 'demo-order-3',
        refundId: 'demo-refund-3',
        failureReason: 'card declined',
      },
    },
    {
      eventId: unknownEventId,
      payload: { template: 'purchase_order_created', poId: 'demo-po-1' },
    },
  ];

  if (liveConsumerAvailable) {
    console.log('[commands-demo] publishing synthetic notify.send commands onto a live marketing/notify.commands topic...');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Client } = require('pulsar-client');
    const client = new Client({ serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650' });
    const producer = await client.createProducer({
      topic: topicForCommands(tenant, marketingNamespace, 'notify'),
    });
    for (const command of commands) {
      const envelope = createEnvelope({
        eventId: command.eventId,
        eventType: 'notify.send',
        storeId,
        aggregateType: 'campaign',
        aggregateId: command.eventId,
        payload: command.payload,
      });
      await producer.send({ data: encodeEnvelope(envelope) });
    }
    await producer.close();
    await client.close();

    console.log('[commands-demo] waiting for the real consumer to process them (up to 30s each)...');
    await waitUntil(
      () => sendLogRepo.findOne({ where: { sourceEventId: campaignEventId } }),
      () => true,
      30_000,
    );
    await waitUntil(
      () => sendLogRepo.findOne({ where: { sourceEventId: refundEventId } }),
      () => true,
      30_000,
    );
    // Give the skip/unknown cases a moment too, even though no send_log
    // row is ever expected for them — nothing to wait on, just a beat.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  } else {
    console.log('[commands-demo] no live consumer — calling the mapper + DispatchService.dispatch() directly...');
    for (const command of commands) {
      const mapped = mapNotifyCommand(command.payload);
      if (mapped.action === 'skip') {
        console.log(`[commands-demo]   ${command.eventId}: skipped (${mapped.reason})`);
        continue;
      }
      await dispatch.dispatch({ storeId, sourceEventId: command.eventId, ...mapped.input });
    }
  }

  console.log('[commands-demo] verifying campaign -> email send_log row...');
  const campaignRow = await sendLogRepo.findOne({ where: { sourceEventId: campaignEventId } });
  assert(!!campaignRow, 'campaign command should have created a send_log row');
  assert(campaignRow!.status === SendStatus.Sent, `campaign send should be sent, got ${campaignRow!.status}`);
  assert(campaignRow!.refTable === 'campaign_send', 'campaign send_log should reference campaign_send');
  console.log('[commands-demo] OK — campaign dispatched.');

  console.log('[commands-demo] verifying refund -> customer email send_log row (with message override)...');
  const refundRow = await sendLogRepo.findOne({ where: { sourceEventId: refundEventId } });
  assert(!!refundRow, 'refund command should have created a send_log row');
  assert(refundRow!.status === SendStatus.Sent, `refund send should be sent, got ${refundRow!.status}`);
  assert(refundRow!.renderedBody === 'Sorry for the trouble!', 'refund body override should be the merchant message verbatim');
  console.log('[commands-demo] OK — refund dispatched with body override.');

  console.log('[commands-demo] verifying sendToCustomer=false refund created no send_log row...');
  const skippedRow = await sendLogRepo.findOne({ where: { sourceEventId: refundSkippedEventId } });
  assert(!skippedRow, 'sendToCustomer=false should never create a send_log row');
  console.log('[commands-demo] OK — skipped as expected.');

  console.log('[commands-demo] verifying refund_failed_staff_alert -> in-app broadcast send_log row...');
  const staffAlertRow = await sendLogRepo.findOne({ where: { sourceEventId: staffAlertEventId } });
  assert(!!staffAlertRow, 'refund_failed_staff_alert should have created a send_log row');
  assert(staffAlertRow!.status === SendStatus.Sent, `staff alert should be sent, got ${staffAlertRow!.status}`);
  assert(staffAlertRow!.recipient === 'broadcast', 'staff alert recipient should be the broadcast convention');
  assert(
    staffAlertRow!.renderedBody!.includes('card declined'),
    'staff alert body should include the failure reason',
  );
  console.log('[commands-demo] OK — staff alert dispatched as an in-app broadcast.');

  console.log('[commands-demo] verifying an unknown template value created no send_log row (ack+log, no nack-loop)...');
  const unknownRow = await sendLogRepo.findOne({ where: { sourceEventId: unknownEventId } });
  assert(!unknownRow, 'an unknown template should never create a send_log row');
  console.log('[commands-demo] OK — unknown template acked and skipped, not nack-looped.');

  console.log('[commands-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[commands-demo] FAILED:', err);
  process.exit(1);
});
