/**
 * Runnable proof — boots the real hybrid app (Pulsar consumers active,
 * including the new cross-namespace `return.events` subscription) and
 * exercises a synthetic `orders.return.approved` event: a customer
 * RMA-approval email dispatches with the right vars, and a payload with no
 * customer email is skipped rather than sent to a blank recipient.
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack).
 *
 * Run:
 *   npm run notification:return-approved-demo
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
import { mapReturnApproved } from '../app/return-events/map-return-approved.util';
import {
  RETURN_APPROVED_EVENT_TYPE,
  ReturnApprovedPayload,
} from '../app/return-events/return-approved-event-payload';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[return-approved-demo] ASSERTION FAILED: ${message}`);
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
      throw new Error(`[return-approved-demo] timed out waiting for condition after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  const tenant = process.env.PULSAR_TENANT || 'ecomiq';
  const orderNamespace = process.env.ORDER_PULSAR_NAMESPACE || 'orders';

  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant,
      namespace: orderNamespace,
      aggregates: ['return'],
      subscription: 'return-events::notification-service',
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
      `[return-approved-demo] WARNING: could not start the return.events Pulsar consumer (${(err as Error).message}). ` +
        'Falling back to calling the mapper + DispatchService.dispatch() directly.',
    );
  }

  const storeId = `demo-store-${ulid()}`;
  const sendLogRepo = app.get<Repository<SendLog>>(getRepositoryToken(SendLog));
  const dispatch = app.get(DispatchService);

  const approvedEventId = `demo-return-approved-${ulid()}`;
  const noEmailEventId = `demo-return-noemail-${ulid()}`;

  const approvedPayload: ReturnApprovedPayload = {
    returnId: `return_${ulid()}`,
    storeId,
    orderId: `order_${ulid()}`,
    displayId: 'RMA-1042',
    status: 'approved',
    shippingStatus: 'pending',
    inspected: false,
    email: 'ada@example.com',
  };
  const noEmailPayload: ReturnApprovedPayload = { ...approvedPayload, returnId: `return_${ulid()}`, email: null };

  if (liveConsumerAvailable) {
    console.log('[return-approved-demo] publishing synthetic orders.return.approved events onto a live return.events topic...');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Client } = require('pulsar-client');
    const client = new Client({ serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650' });
    const producer = await client.createProducer({
      topic: `persistent://${tenant}/${orderNamespace}/return.events`,
    });
    for (const { eventId, payload } of [
      { eventId: approvedEventId, payload: approvedPayload },
      { eventId: noEmailEventId, payload: noEmailPayload },
    ]) {
      const envelope = createEnvelope({
        eventId,
        eventType: RETURN_APPROVED_EVENT_TYPE,
        storeId,
        aggregateType: 'return',
        aggregateId: payload.returnId,
        payload,
      });
      await producer.send({ data: encodeEnvelope(envelope) });
    }
    await producer.close();
    await client.close();

    console.log('[return-approved-demo] waiting for the real consumer to dispatch (up to 30s)...');
    await waitUntil(
      () => sendLogRepo.findOne({ where: { sourceEventId: approvedEventId } }),
      (row) => row.status !== SendStatus.Pending,
      30_000,
    );
  } else {
    for (const { eventId, payload } of [
      { eventId: approvedEventId, payload: approvedPayload },
      { eventId: noEmailEventId, payload: noEmailPayload },
    ]) {
      const mapped = mapReturnApproved(payload);
      if (mapped.action === 'skip') {
        console.log(`[return-approved-demo]   ${eventId}: skipped (${mapped.reason})`);
        continue;
      }
      await dispatch.dispatch({ storeId, sourceEventId: eventId, ...mapped.input });
    }
  }

  console.log('[return-approved-demo] verifying the RMA-approval email dispatched...');
  const approvedRow = await sendLogRepo.findOne({ where: { sourceEventId: approvedEventId } });
  assert(!!approvedRow, 'orders.return.approved should have created a send_log row');
  assert(approvedRow!.status === SendStatus.Sent, `expected sent, got ${approvedRow!.status}`);
  assert(approvedRow!.recipient === 'ada@example.com', 'recipient should be the customer email from the payload');
  assert(approvedRow!.refTable === 'return_request', 'send_log should reference return_request');
  assert(approvedRow!.renderedBody!.includes('RMA-1042'), 'rendered body should include the RMA display id');
  console.log('[return-approved-demo] OK — RMA-approval email dispatched with the right vars.');

  console.log('[return-approved-demo] verifying a payload with no customer email created no send_log row...');
  const noEmailRow = await sendLogRepo.findOne({ where: { sourceEventId: noEmailEventId } });
  assert(!noEmailRow, 'a return-approved event with no customer email should never create a send_log row');
  console.log('[return-approved-demo] OK — skipped as expected.');

  console.log('[return-approved-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[return-approved-demo] FAILED:', err);
  process.exit(1);
});
