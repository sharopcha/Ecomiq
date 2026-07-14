/**
 * Runnable proof — the integration proof for the `welcome`/`review_request`
 * template kinds crm-service has been emitting `notify.send` commands for
 * since earlier steps (register flow, review-request flow) with no template
 * to actually render against; those commands were ack-and-skipped by
 * design until now, no replay of the backlog is attempted. Boots the real
 * hybrid app (both Pulsar consumer connections active, same as
 * `commands-demo.ts`) and exercises: a `welcome` command with an email
 * dispatches and renders `Customer_name`, a `review_request` command with
 * an email dispatches and renders `Customer_name`/`Order_ID`, and either
 * command with no `email` (crm's `customer.email` is nullable) is a no-op
 * skip rather than a send to `""`.
 *
 * Falls back to calling the mapper + `DispatchService.dispatch()` directly
 * if the live consumer can't start — same resilience pattern
 * `commands-demo.ts` uses.
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack).
 *
 * Run:
 *   npm run notification:crm-templates-demo
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
import { TemplateKind } from '../app/entities/email-template.entity';

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
      throw new Error(`[crm-templates-demo] timed out waiting for condition after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[crm-templates-demo] ASSERTION FAILED: ${message}`);
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

  await app.init();

  let liveConsumerAvailable = true;
  try {
    await app.startAllMicroservices();
  } catch (err) {
    liveConsumerAvailable = false;
    console.warn(
      `[crm-templates-demo] WARNING: could not start the Pulsar consumers (${(err as Error).message}). ` +
        'Falling back to calling the mapper + DispatchService.dispatch() directly instead of publishing onto a live topic.',
    );
  }

  const storeId = `demo-store-${ulid()}`;
  const sendLogRepo = app.get<Repository<SendLog>>(getRepositoryToken(SendLog));
  const dispatch = app.get(DispatchService);

  const welcomeEventId = `demo-cmd-welcome-${ulid()}`;
  const welcomeNoEmailEventId = `demo-cmd-welcome-noemail-${ulid()}`;
  const reviewRequestEventId = `demo-cmd-review-request-${ulid()}`;
  const reviewRequestNoEmailEventId = `demo-cmd-review-request-noemail-${ulid()}`;

  const commands: Array<{ eventId: string; payload: Record<string, unknown> }> = [
    {
      eventId: welcomeEventId,
      payload: {
        template: 'welcome',
        customerId: 'demo-customer-1',
        customerName: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    },
    {
      eventId: welcomeNoEmailEventId,
      payload: {
        template: 'welcome',
        customerId: 'demo-customer-2',
        customerName: 'No Email Customer',
        email: null,
      },
    },
    {
      eventId: reviewRequestEventId,
      payload: {
        template: 'review_request',
        orderId: 'demo-order-1',
        customerId: 'demo-customer-1',
        customerName: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    },
    {
      eventId: reviewRequestNoEmailEventId,
      payload: {
        template: 'review_request',
        orderId: 'demo-order-2',
        customerId: 'demo-customer-2',
        customerName: 'No Email Customer',
        email: null,
      },
    },
  ];

  if (liveConsumerAvailable) {
    console.log('[crm-templates-demo] publishing synthetic notify.send commands onto a live marketing/notify.commands topic...');
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
        aggregateType: 'customer',
        aggregateId: command.eventId,
        payload: command.payload,
      });
      await producer.send({ data: encodeEnvelope(envelope) });
    }
    await producer.close();
    await client.close();

    console.log('[crm-templates-demo] waiting for the real consumer to process them (up to 30s each)...');
    await waitUntil(
      () => sendLogRepo.findOne({ where: { sourceEventId: welcomeEventId } }),
      () => true,
      30_000,
    );
    await waitUntil(
      () => sendLogRepo.findOne({ where: { sourceEventId: reviewRequestEventId } }),
      () => true,
      30_000,
    );
    // No send_log row is ever expected for the no-email cases — nothing to wait on, just a beat.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  } else {
    console.log('[crm-templates-demo] no live consumer — calling the mapper + DispatchService.dispatch() directly...');
    for (const command of commands) {
      const mapped = mapNotifyCommand(command.payload);
      if (mapped.action === 'skip') {
        console.log(`[crm-templates-demo]   ${command.eventId}: skipped (${mapped.reason})`);
        continue;
      }
      await dispatch.dispatch({ storeId, sourceEventId: command.eventId, ...mapped.input });
    }
  }

  console.log('[crm-templates-demo] verifying welcome -> email send_log row with Customer_name rendered...');
  const welcomeRow = await sendLogRepo.findOne({ where: { sourceEventId: welcomeEventId } });
  assert(!!welcomeRow, 'welcome command should have created a send_log row');
  assert(welcomeRow!.status === SendStatus.Sent, `welcome send should be sent, got ${welcomeRow!.status}`);
  assert(welcomeRow!.templateKind === TemplateKind.Welcome, `expected templateKind welcome, got ${welcomeRow!.templateKind}`);
  assert(welcomeRow!.refTable === 'customer', 'welcome send_log should reference customer');
  assert(
    welcomeRow!.renderedBody!.includes('Ada Lovelace'),
    `expected the rendered body to include the customer name, got ${welcomeRow!.renderedBody}`,
  );
  console.log('[crm-templates-demo] OK — welcome dispatched with Customer_name rendered.');

  console.log('[crm-templates-demo] verifying a welcome command with no email created no send_log row...');
  const welcomeNoEmailRow = await sendLogRepo.findOne({ where: { sourceEventId: welcomeNoEmailEventId } });
  assert(!welcomeNoEmailRow, 'a welcome command with no email should never create a send_log row');
  console.log('[crm-templates-demo] OK — skipped as expected, no send to an empty recipient.');

  console.log('[crm-templates-demo] verifying review_request -> email send_log row with Customer_name/Order_ID rendered...');
  const reviewRequestRow = await sendLogRepo.findOne({ where: { sourceEventId: reviewRequestEventId } });
  assert(!!reviewRequestRow, 'review_request command should have created a send_log row');
  assert(
    reviewRequestRow!.status === SendStatus.Sent,
    `review_request send should be sent, got ${reviewRequestRow!.status}`,
  );
  assert(
    reviewRequestRow!.templateKind === TemplateKind.ReviewRequest,
    `expected templateKind review_request, got ${reviewRequestRow!.templateKind}`,
  );
  assert(reviewRequestRow!.refTable === 'order', 'review_request send_log should reference order');
  assert(
    reviewRequestRow!.renderedBody!.includes('Ada Lovelace') && reviewRequestRow!.renderedBody!.includes('demo-order-1'),
    `expected the rendered body to include customer name and order id, got ${reviewRequestRow!.renderedBody}`,
  );
  console.log('[crm-templates-demo] OK — review_request dispatched with Customer_name/Order_ID rendered.');

  console.log('[crm-templates-demo] verifying a review_request command with no email created no send_log row...');
  const reviewRequestNoEmailRow = await sendLogRepo.findOne({
    where: { sourceEventId: reviewRequestNoEmailEventId },
  });
  assert(!reviewRequestNoEmailRow, 'a review_request command with no email should never create a send_log row');
  console.log('[crm-templates-demo] OK — skipped as expected, no send to an empty recipient.');

  console.log('[crm-templates-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[crm-templates-demo] FAILED:', err);
  process.exit(1);
});
