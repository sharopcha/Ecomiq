/**
 * Live verification tool — subscribes to catalog-service's real
 * `product.events` Pulsar topic and prints every envelope as it arrives.
 * Not part of the running service; run by hand alongside catalog-service to
 * *see* the outbox -> relay -> Pulsar pipeline actually work end-to-end:
 *
 *   docker compose up -d postgres pulsar
 *   npm run catalog:events:tail
 *   # in another terminal: nx serve catalog-service, then create/update/
 *   # delete a product or variant via the API — each one should print here
 *   # within ~1s (the outbox relay's poll interval).
 *
 * Uses a unique subscription name per run (`tail-<timestamp>`) so re-running
 * this script doesn't compete with a previous run's cursor or with
 * inventory-service's eventual real subscription — this is a read-only
 * observer, not a consumer any other part of the system depends on.
 */
import 'reflect-metadata';
import { ensurePulsarNamespace, ensurePulsarTenant } from '@temp-nx/pulsar';
import { topicForAggregate, decodeEnvelope } from '@temp-nx/pulsar';

async function main() {
  const serviceUrl = process.env['PULSAR_SERVICE_URL'] ?? 'pulsar://localhost:6650';
  const adminUrl = process.env['PULSAR_ADMIN_URL'] ?? 'http://localhost:8080';
  const tenant = process.env['PULSAR_TENANT'] ?? 'ecomiq';
  const namespace = process.env['CATALOG_PULSAR_NAMESPACE'] ?? 'catalog';

  await ensurePulsarTenant({ adminUrl, tenant });
  await ensurePulsarNamespace({ adminUrl, tenant, namespace });

  const topic = topicForAggregate(tenant, namespace, 'product');

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('pulsar-client');
  const client = new Client({ serviceUrl });

  console.log(`[tail] connecting to ${serviceUrl}`);
  const consumer = await client.subscribe({
    topic,
    subscription: `tail-${Date.now()}`,
    subscriptionType: 'Shared',
  });
  console.log(`[tail] listening on ${topic} — create/update/delete a product or variant now`);

  let count = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const message = await consumer.receive();
    const envelope = decodeEnvelope(message.getData());
    count += 1;
    console.log(`\n[tail] #${count} ${envelope.eventType} (aggregateId=${envelope.aggregateId})`);
    console.log(JSON.stringify(envelope, null, 2));
    await consumer.acknowledge(message);
  }
}

main().catch((err) => {
  console.error('[tail] FAILED:', err);
  process.exit(1);
});
