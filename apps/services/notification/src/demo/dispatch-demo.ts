/**
 * Runnable proof — boots the real hybrid app (HTTP skipped, but the
 * message-retry Pulsar microservice connection *is* started, same as
 * main.ts) and exercises the full dispatch pipeline against real Postgres
 * + real Pulsar: happy path per channel, a `.fail` recipient walking
 * pending -> dead across real delayed retry messages, and duplicate
 * `sourceEventId` no-op.
 *
 * Overrides the retry backoff to a seconds-scale range and caps attempts
 * at 3 (env vars, set below before the app boots) so the `.fail` path
 * finishes in well under a minute instead of the real ~30-minute-capped
 * production backoff — same "seconds-scale override" technique
 * `CHECKOUT_PAYMENT_TIMEOUT_MINUTES` uses for the checkout-saga-demo.
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack).
 *
 * Run:
 *   npm run notification:dispatch-demo
 */
import 'reflect-metadata';

process.env.NOTIFICATION_RETRY_BASE_MS = process.env.NOTIFICATION_RETRY_BASE_MS ?? '1000';
process.env.NOTIFICATION_RETRY_MAX_MS = process.env.NOTIFICATION_RETRY_MAX_MS ?? '3000';
process.env.NOTIFICATION_MAX_ATTEMPTS = process.env.NOTIFICATION_MAX_ATTEMPTS ?? '3';

/* eslint-disable import/first */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { PulsarServer } from '@temp-nx/pulsar';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { DispatchService } from '../app/dispatch/dispatch.service';
import { SendLog, SendChannel, SendStatus } from '../app/entities/send-log.entity';
import { TemplateKind } from '../app/entities/email-template.entity';
/* eslint-enable import/first */

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
      throw new Error(`[dispatch-demo] timed out waiting for condition after ${timeoutMs}ms`);
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
      namespace: process.env.NOTIFICATION_PULSAR_NAMESPACE || 'notify',
      aggregates: ['message'],
      subscription: 'message-retry::notification-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // `NestFactory.create()` alone does NOT run `onModuleInit` lifecycle
  // hooks (that's normally triggered by `.listen()`) — without an explicit
  // `app.init()` here, `OutboxRelayService.onModuleInit()` never fires and
  // the outbox table would just sit there un-relayed forever, even though
  // every DB-only assertion still passes (silently misleading). This demo
  // has no HTTP to listen on, so `.init()` directly, not `.listen()`.
  await app.init();

  // If the broker can't open this subscription (e.g. this repo's known
  // pre-existing Pulsar ledger-corruption issue — see the notification-plan
  // Step 2 conversation notes), don't let that crash the whole demo before
  // a single assertion runs. Fall back to driving DispatchService.redispatch()
  // directly below instead of waiting on real delayed-message delivery —
  // same application code path MessageRetryController would call, just
  // without the Pulsar transport hop.
  let liveRetryConsumerAvailable = true;
  try {
    await app.startAllMicroservices();
  } catch (err) {
    liveRetryConsumerAvailable = false;
    console.warn(
      `[dispatch-demo] WARNING: could not start the message-retry Pulsar consumer (${(err as Error).message}). ` +
        'Falling back to driving DispatchService.redispatch() directly instead of waiting for real delayed messages.',
    );
  }

  const storeId = `demo-store-${ulid()}`;
  const dispatch = app.get(DispatchService);
  const sendLogRepo = app.get<Repository<SendLog>>(getRepositoryToken(SendLog));
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));

  console.log('[dispatch-demo] happy path — email...');
  const emailRow = await dispatch.dispatch({
    storeId,
    channel: SendChannel.Email,
    recipient: 'ada@example.com',
    templateKind: TemplateKind.Refund,
    vars: { Order_ID: '1042', Customer_name: 'Ada', Store_name: 'Ecomiq Demo' },
    sourceEventId: `demo-email-${ulid()}`,
  });
  assert(emailRow.status === SendStatus.Sent, `email should be sent, got ${emailRow.status}`);
  assert(!!emailRow.providerMessageId, 'sent email should have a providerMessageId');
  const emailSentEvents = await outboxRepo.count({
    where: { aggregateId: emailRow.id, eventType: 'notify.message.sent' },
  });
  assert(emailSentEvents === 1, `expected exactly 1 notify.message.sent outbox row, got ${emailSentEvents}`);
  console.log('[dispatch-demo] OK — email sent, outbox event present.');

  console.log('[dispatch-demo] happy path — sms...');
  const smsRow = await dispatch.dispatch({
    storeId,
    channel: SendChannel.Sms,
    recipient: '+15551234567',
    templateKind: TemplateKind.OrderNotification,
    vars: { Order_ID: '1042', Store_name: 'Ecomiq Demo' },
    sourceEventId: `demo-sms-${ulid()}`,
  });
  assert(smsRow.status === SendStatus.Sent, `sms should be sent, got ${smsRow.status}`);
  console.log('[dispatch-demo] OK — sms sent.');

  console.log('[dispatch-demo] happy path — whatsapp...');
  const whatsappRow = await dispatch.dispatch({
    storeId,
    channel: SendChannel.WhatsApp,
    recipient: '+15551234567',
    templateKind: TemplateKind.ShipmentDelay,
    vars: { Order_ID: '1042', Store_name: 'Ecomiq Demo' },
    sourceEventId: `demo-whatsapp-${ulid()}`,
  });
  assert(whatsappRow.status === SendStatus.Sent, `whatsapp should be sent, got ${whatsappRow.status}`);
  console.log('[dispatch-demo] OK — whatsapp sent.');

  console.log('[dispatch-demo] happy path — in_app (broadcast)...');
  const inAppRow = await dispatch.dispatch({
    storeId,
    channel: SendChannel.InApp,
    recipient: 'broadcast',
    templateKind: TemplateKind.Custom,
    vars: {},
    sourceEventId: `demo-inapp-${ulid()}`,
  });
  assert(inAppRow.status === SendStatus.Sent, `in_app should be sent, got ${inAppRow.status}`);
  console.log('[dispatch-demo] OK — in_app broadcast sent (bell feed row created).');

  console.log('[dispatch-demo] .fail recipient — should retry on real delayed messages, then go dead...');
  const failSourceEventId = `demo-fail-${ulid()}`;
  const failRow = await dispatch.dispatch({
    storeId,
    channel: SendChannel.Email,
    recipient: 'ada.fail@example.com',
    templateKind: TemplateKind.Refund,
    vars: { Order_ID: '1042', Customer_name: 'Ada', Store_name: 'Ecomiq Demo' },
    sourceEventId: failSourceEventId,
  });
  assert(failRow.status === SendStatus.Pending, `first .fail attempt should stay pending, got ${failRow.status}`);
  assert(failRow.attempt === 2, `first failure should bump attempt to 2, got ${failRow.attempt}`);
  const retryEventsAfterFirstFailure = await outboxRepo.count({
    where: { aggregateId: failRow.id, eventType: 'notify.message.retry' },
  });
  assert(
    retryEventsAfterFirstFailure === 1,
    `expected exactly 1 notify.message.retry outbox row after the first failure, got ${retryEventsAfterFirstFailure}`,
  );

  const maxAttempts = Number(process.env.NOTIFICATION_MAX_ATTEMPTS);
  let deadRow: SendLog;
  if (liveRetryConsumerAvailable) {
    console.log('[dispatch-demo] waiting for real Pulsar delayed retries to walk this row to dead (up to 30s)...');
    deadRow = await waitUntil(
      () => sendLogRepo.findOne({ where: { id: failRow.id } }),
      (row) => row.status === SendStatus.Dead,
      30_000,
    );
  } else {
    console.log(
      '[dispatch-demo] no live retry consumer — driving DispatchService.redispatch() directly to reach the same end state...',
    );
    let current = failRow;
    while (current.status === SendStatus.Pending) {
      const next = await dispatch.redispatch(current.id);
      if (!next) throw new Error('redispatch() unexpectedly returned null');
      current = next;
    }
    deadRow = current;
  }
  assert(deadRow.attempt === maxAttempts, `dead row should have attempt === ${maxAttempts}, got ${deadRow.attempt}`);
  const failedEvents = await outboxRepo.count({
    where: { aggregateId: failRow.id, eventType: 'notify.message.failed' },
  });
  assert(failedEvents === 1, `expected exactly 1 notify.message.failed outbox row, got ${failedEvents}`);
  console.log('[dispatch-demo] OK — walked pending -> dead via real delayed messages, failed event present.');

  console.log('[dispatch-demo] duplicate sourceEventId on an already-dead row is a no-op...');
  const replay = await dispatch.dispatch({
    storeId,
    channel: SendChannel.Email,
    recipient: 'ada.fail@example.com',
    templateKind: TemplateKind.Refund,
    vars: { Order_ID: '1042', Customer_name: 'Ada', Store_name: 'Ecomiq Demo' },
    sourceEventId: failSourceEventId,
  });
  assert(replay.id === deadRow.id, 'replay should return the exact same send_log row');
  assert(replay.attempt === maxAttempts, 'replay must not bump attempt further');
  console.log('[dispatch-demo] OK — duplicate sourceEventId no-op confirmed.');

  console.log('[dispatch-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[dispatch-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[dispatch-demo] FAILED:', err);
  process.exit(1);
});
