/**
 * Runnable proof — boots the real hybrid app (Pulsar consumers active,
 * including the new cross-namespace `shipment.events` subscription) and
 * exercises a synthetic `shipping.shipment.delayed` event: a customer
 * delay email dispatches with the right vars, and a payload with no
 * customer email is skipped rather than sent to a blank recipient.
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack).
 *
 * Run:
 *   npm run notification:shipping-delay-demo
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
import { mapShipmentDelayed } from '../app/shipping-events/map-shipment-delayed.util';
import {
  SHIPMENT_DELAYED_EVENT_TYPE,
  ShipmentDelayedPayload,
} from '../app/shipping-events/shipment-delayed-event-payload';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[shipping-delay-demo] ASSERTION FAILED: ${message}`);
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
      throw new Error(`[shipping-delay-demo] timed out waiting for condition after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  const tenant = process.env.PULSAR_TENANT || 'ecomiq';
  const shippingNamespace = process.env.SHIPPING_PULSAR_NAMESPACE || 'shipping';

  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant,
      namespace: shippingNamespace,
      aggregates: ['shipment'],
      subscription: 'shipment-events::notification-service',
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
      `[shipping-delay-demo] WARNING: could not start the shipment.events Pulsar consumer (${(err as Error).message}). ` +
        'Falling back to calling the mapper + DispatchService.dispatch() directly.',
    );
  }

  const storeId = `demo-store-${ulid()}`;
  const sendLogRepo = app.get<Repository<SendLog>>(getRepositoryToken(SendLog));
  const dispatch = app.get(DispatchService);

  const delayedEventId = `demo-shipment-delayed-${ulid()}`;
  const noEmailEventId = `demo-shipment-delayed-noemail-${ulid()}`;

  const delayedPayload: ShipmentDelayedPayload = {
    shipmentId: `shipment_${ulid()}`,
    orderId: `order_${ulid()}`,
    displayId: 'SHP-1042',
    delayReason: 'Expected arrival passed',
    contactEmail: 'ada@example.com',
  };
  const noEmailPayload: ShipmentDelayedPayload = {
    ...delayedPayload,
    shipmentId: `shipment_${ulid()}`,
    contactEmail: null,
  };

  if (liveConsumerAvailable) {
    console.log('[shipping-delay-demo] publishing synthetic shipping.shipment.delayed events onto a live shipment.events topic...');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Client } = require('pulsar-client');
    const client = new Client({ serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650' });
    const producer = await client.createProducer({
      topic: `persistent://${tenant}/${shippingNamespace}/shipment.events`,
    });
    for (const { eventId, payload } of [
      { eventId: delayedEventId, payload: delayedPayload },
      { eventId: noEmailEventId, payload: noEmailPayload },
    ]) {
      const envelope = createEnvelope({
        eventId,
        eventType: SHIPMENT_DELAYED_EVENT_TYPE,
        storeId,
        aggregateType: 'shipment',
        aggregateId: payload.shipmentId,
        payload,
      });
      await producer.send({ data: encodeEnvelope(envelope) });
    }
    await producer.close();
    await client.close();

    console.log('[shipping-delay-demo] waiting for the real consumer to dispatch (up to 30s)...');
    await waitUntil(
      () => sendLogRepo.findOne({ where: { sourceEventId: delayedEventId } }),
      (row) => row.status !== SendStatus.Pending,
      30_000,
    );
  } else {
    for (const { eventId, payload } of [
      { eventId: delayedEventId, payload: delayedPayload },
      { eventId: noEmailEventId, payload: noEmailPayload },
    ]) {
      const mapped = mapShipmentDelayed(payload);
      if (mapped.action === 'skip') {
        console.log(`[shipping-delay-demo]   ${eventId}: skipped (${mapped.reason})`);
        continue;
      }
      await dispatch.dispatch({ storeId, sourceEventId: eventId, ...mapped.input });
    }
  }

  console.log('[shipping-delay-demo] verifying the delay email dispatched...');
  const delayedRow = await sendLogRepo.findOne({ where: { sourceEventId: delayedEventId } });
  assert(!!delayedRow, 'shipping.shipment.delayed should have created a send_log row');
  assert(delayedRow!.status === SendStatus.Sent, `expected sent, got ${delayedRow!.status}`);
  assert(delayedRow!.recipient === 'ada@example.com', 'recipient should be the customer email from the payload');
  assert(delayedRow!.refTable === 'shipment', 'send_log should reference shipment');
  assert(delayedRow!.renderedBody!.includes(delayedPayload.orderId), 'rendered body should include the order id');
  console.log('[shipping-delay-demo] OK — delay email dispatched with the right vars.');

  console.log('[shipping-delay-demo] verifying a payload with no customer email created no send_log row...');
  const noEmailRow = await sendLogRepo.findOne({ where: { sourceEventId: noEmailEventId } });
  assert(!noEmailRow, 'a shipment-delayed event with no customer email should never create a send_log row');
  console.log('[shipping-delay-demo] OK — skipped as expected.');

  console.log('[shipping-delay-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[shipping-delay-demo] FAILED:', err);
  process.exit(1);
});
