/**
 * Live verification tool — a debug tail, not the consumer.
 * notification-service's own `NotifyCommandsController`
 * (`notify-commands::notification-service`, a durable `Shared`
 * subscription) is the real consumer of marketing's `notify.commands`
 * topic as of the notification-plan's Step 7; this script subscribes with
 * its own timestamped, non-durable subscription name
 * (`notify-tail-<timestamp>`) purely to watch traffic go by, and never
 * competes with the real consumer for messages — Pulsar delivers each
 * message to *every* distinct subscription on a topic, not just one.
 * Pretty-prints every `notify.send` command as it arrives (campaign sends
 * here, refund settlement/failure in order-service) — still useful for
 * live debugging, just no longer standing in for anything. Clone of
 * catalog-service's `tail-catalog-events.ts`, subscribing to a command
 * topic (`topicForCommands`) instead of an aggregate-events topic.
 *
 * Run:
 *   npm run marketing:notify-tail
 *   # in another terminal: schedule a campaign a few seconds out, or
 *   # approve a refund in order-service — each notify.send command prints
 *   # here within ~1s (the outbox relay's poll interval).
 */
import 'reflect-metadata';
import { ensurePulsarNamespace, ensurePulsarTenant } from '@temp-nx/pulsar';
import { topicForCommands, decodeEnvelope } from '@temp-nx/pulsar';

async function main() {
  const serviceUrl = process.env['PULSAR_SERVICE_URL'] ?? 'pulsar://localhost:6650';
  const adminUrl = process.env['PULSAR_ADMIN_URL'] ?? 'http://localhost:8080';
  const tenant = process.env['PULSAR_TENANT'] ?? 'ecomiq';
  const namespace = process.env['MARKETING_PULSAR_NAMESPACE'] ?? 'marketing';

  await ensurePulsarTenant({ adminUrl, tenant });
  await ensurePulsarNamespace({ adminUrl, tenant, namespace });

  const topic = topicForCommands(tenant, namespace, 'notify');

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('pulsar-client');
  const client = new Client({ serviceUrl });

  console.log(`[notify-tail] connecting to ${serviceUrl}`);
  const consumer = await client.subscribe({
    topic,
    subscription: `notify-tail-${Date.now()}`,
    subscriptionType: 'Shared',
  });
  console.log(`[notify-tail] listening on ${topic} — schedule a campaign or approve a refund now`);

  let count = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const message = await consumer.receive();
    const envelope = decodeEnvelope(message.getData());
    count += 1;
    console.log(`\n[notify-tail] #${count} ${envelope.eventType} (aggregateId=${envelope.aggregateId})`);
    console.log(JSON.stringify(envelope, null, 2));
    await consumer.acknowledge(message);
  }
}

main().catch((err) => {
  console.error('[notify-tail] FAILED:', err);
  process.exit(1);
});
