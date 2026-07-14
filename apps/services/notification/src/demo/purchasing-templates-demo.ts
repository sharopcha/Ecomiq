/**
 * Runnable proof — the integration proof for the `purchase_order` template
 * kind purchasing-service has been emitting `notify.send` commands for
 * since Step 7 (PO send) with no template to actually render against; those
 * commands were ack-and-skipped by design until now, no replay of the
 * backlog is attempted. Boots the real hybrid app (both Pulsar consumer
 * connections active, same as `crm-templates-demo.ts`) and exercises: a
 * `purchase_order` command with an email dispatches and renders
 * `Supplier_name` (via the shipped default template, no override), a second
 * command supplies `subject`/`body` overrides from the wizard's recipient-
 * email step and those win over the default template, and a command with
 * no `email` is a no-op skip rather than a send to `""`.
 *
 * Falls back to calling the mapper + `DispatchService.dispatch()` directly
 * if the live consumer can't start — same resilience pattern
 * `crm-templates-demo.ts` uses.
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack).
 *
 * Run:
 *   npm run notification:purchasing-templates-demo
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
      throw new Error(`[purchasing-templates-demo] timed out waiting for condition after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[purchasing-templates-demo] ASSERTION FAILED: ${message}`);
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
      `[purchasing-templates-demo] WARNING: could not start the Pulsar consumers (${(err as Error).message}). ` +
        'Falling back to calling the mapper + DispatchService.dispatch() directly instead of publishing onto a live topic.',
    );
  }

  const storeId = `demo-store-${ulid()}`;
  const sendLogRepo = app.get<Repository<SendLog>>(getRepositoryToken(SendLog));
  const dispatch = app.get(DispatchService);

  const defaultTemplateEventId = `demo-cmd-po-default-${ulid()}`;
  const overrideEventId = `demo-cmd-po-override-${ulid()}`;
  const noEmailEventId = `demo-cmd-po-noemail-${ulid()}`;

  const commands: Array<{ eventId: string; payload: Record<string, unknown> }> = [
    {
      eventId: defaultTemplateEventId,
      payload: {
        template: 'purchase_order',
        poId: 'demo-po-1',
        supplierId: 'demo-supplier-1',
        supplierName: 'Acme Textiles',
        email: 'orders@acme-textiles.example',
      },
    },
    {
      eventId: overrideEventId,
      payload: {
        template: 'purchase_order',
        poId: 'demo-po-2',
        supplierId: 'demo-supplier-2',
        supplierName: 'Northwind Fabrics',
        email: 'orders@northwind.example',
        subject: 'Custom subject from the wizard',
        body: 'Custom body from the wizard',
      },
    },
    {
      eventId: noEmailEventId,
      payload: {
        template: 'purchase_order',
        poId: 'demo-po-3',
        supplierName: 'No Email Supplier',
        email: null,
      },
    },
  ];

  if (liveConsumerAvailable) {
    console.log('[purchasing-templates-demo] publishing synthetic notify.send commands onto a live marketing/notify.commands topic...');
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
        aggregateType: 'po',
        aggregateId: command.eventId,
        payload: command.payload,
      });
      await producer.send({ data: encodeEnvelope(envelope) });
    }
    await producer.close();
    await client.close();

    console.log('[purchasing-templates-demo] waiting for the real consumer to process them (up to 30s each)...');
    await waitUntil(
      () => sendLogRepo.findOne({ where: { sourceEventId: defaultTemplateEventId } }),
      () => true,
      30_000,
    );
    await waitUntil(
      () => sendLogRepo.findOne({ where: { sourceEventId: overrideEventId } }),
      () => true,
      30_000,
    );
    // No send_log row is ever expected for the no-email case — nothing to wait on, just a beat.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  } else {
    console.log('[purchasing-templates-demo] no live consumer — calling the mapper + DispatchService.dispatch() directly...');
    for (const command of commands) {
      const mapped = mapNotifyCommand(command.payload);
      if (mapped.action === 'skip') {
        console.log(`[purchasing-templates-demo]   ${command.eventId}: skipped (${mapped.reason})`);
        continue;
      }
      await dispatch.dispatch({ storeId, sourceEventId: command.eventId, ...mapped.input });
    }
  }

  console.log('[purchasing-templates-demo] verifying purchase_order (no override) -> email send_log row with the default template + Supplier_name rendered...');
  const defaultRow = await sendLogRepo.findOne({ where: { sourceEventId: defaultTemplateEventId } });
  assert(!!defaultRow, 'purchase_order command should have created a send_log row');
  assert(defaultRow!.status === SendStatus.Sent, `purchase_order send should be sent, got ${defaultRow!.status}`);
  assert(
    defaultRow!.templateKind === TemplateKind.PurchaseOrder,
    `expected templateKind purchase_order, got ${defaultRow!.templateKind}`,
  );
  assert(defaultRow!.refTable === 'purchase_order', 'purchase_order send_log should reference purchase_order');
  assert(
    defaultRow!.renderedBody!.includes('Acme Textiles'),
    `expected the rendered body to include the supplier name, got ${defaultRow!.renderedBody}`,
  );
  console.log('[purchasing-templates-demo] OK — dispatched with the default template, Supplier_name rendered.');

  console.log('[purchasing-templates-demo] verifying the wizard\'s subject/body overrides win over the default template...');
  const overrideRow = await sendLogRepo.findOne({ where: { sourceEventId: overrideEventId } });
  assert(!!overrideRow, 'purchase_order command with overrides should have created a send_log row');
  assert(
    overrideRow!.renderedSubject === 'Custom subject from the wizard',
    `expected the override subject, got ${overrideRow!.renderedSubject}`,
  );
  assert(
    overrideRow!.renderedBody === 'Custom body from the wizard',
    `expected the override body, got ${overrideRow!.renderedBody}`,
  );
  console.log('[purchasing-templates-demo] OK — subject/body overrides honored.');

  console.log('[purchasing-templates-demo] verifying a purchase_order command with no email created no send_log row...');
  const noEmailRow = await sendLogRepo.findOne({ where: { sourceEventId: noEmailEventId } });
  assert(!noEmailRow, 'a purchase_order command with no email should never create a send_log row');
  console.log('[purchasing-templates-demo] OK — skipped as expected, no send to an empty recipient.');

  console.log('[purchasing-templates-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[purchasing-templates-demo] FAILED:', err);
  process.exit(1);
});
