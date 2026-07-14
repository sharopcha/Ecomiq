/**
 * Standalone produce/consume smoke test — proves the outbox + Pulsar
 * transport with one demo event. Not part of any service;
 * run by hand against a live Pulsar broker:
 *
 *   docker compose up -d pulsar
 *   npm run pulsar:demo
 *
 * It opens a consumer on a scratch `demo.events` topic, publishes one
 * envelope to that same topic, waits to receive it back, and prints both
 * sides so you can eyeball that they match. Exits non-zero on any failure
 * (timeout, connection refused, etc.) so it's usable as a CI smoke test
 * later, not just a manual check.
 *
 * Self-provisions the "ecomiq" tenant + "catalog" namespace first (see
 * ../lib/provision.ts) so this works standalone against a *freshly created*
 * Pulsar container — without that, consumer/producer creation on a
 * namespace that doesn't exist yet just hangs until timeout.
 */
import 'reflect-metadata';
import { createEnvelope, decodeEnvelope, encodeEnvelope } from '../lib/event-envelope';
import { ensurePulsarNamespace, ensurePulsarTenant } from '../lib/provision';
import { topicForAggregate } from '../lib/topics';

async function main() {
  const serviceUrl = process.env['PULSAR_SERVICE_URL'] ?? 'pulsar://localhost:6650';
  const adminUrl = process.env['PULSAR_ADMIN_URL'] ?? 'http://localhost:8080';
  const tenant = process.env['PULSAR_TENANT'] ?? 'ecomiq';
  // Not scoped to any one service (this is a standalone infra smoke test on
  // a scratch `demo.events` topic), so there's no <SERVICE>_PULSAR_NAMESPACE
  // to read here — just pick an existing, already-provisioned namespace.
  // 'catalog' is arbitrary; any provisioned namespace works equally well.
  const namespace = process.env['PULSAR_DEMO_NAMESPACE'] ?? 'catalog';

  await ensurePulsarTenant({ adminUrl, tenant });
  await ensurePulsarNamespace({ adminUrl, tenant, namespace });

  const topic = topicForAggregate(tenant, namespace, 'demo');

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('pulsar-client');
  const client = new Client({ serviceUrl });

  console.log(`[demo] connecting to ${serviceUrl}`);
  const consumer = await client.subscribe({
    topic,
    subscription: 'shared-pulsar-demo',
    subscriptionType: 'Shared',
  });
  console.log(`[demo] subscribed to ${topic}`);

  const producer = await client.createProducer({ topic });

  const envelope = createEnvelope({
    eventType: 'shared.pulsar.demo',
    storeId: 'demo-store',
    aggregateType: 'demo',
    aggregateId: 'demo-1',
    payload: { hello: 'world', at: new Date().toISOString() },
  });

  await producer.send({ data: encodeEnvelope(envelope) });
  console.log('[demo] published envelope:', envelope);

  const message = await consumer.receive(10_000);
  const received = decodeEnvelope(message.getData());
  await consumer.acknowledge(message);
  console.log('[demo] received envelope:', received);

  if (received.eventId !== envelope.eventId) {
    throw new Error(
      `round-trip mismatch: sent eventId ${envelope.eventId}, received ${received.eventId}`,
    );
  }

  await producer.close();
  await consumer.close();
  await client.close();
  console.log('[demo] OK — produce/consume round-trip proven.');
}

main().catch((err) => {
  console.error('[demo] FAILED:', err);
  process.exit(1);
});
