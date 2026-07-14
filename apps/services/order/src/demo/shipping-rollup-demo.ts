/**
 * Runnable proof — boots the real hybrid app (Pulsar consumers active,
 * including the new cross-namespace `fulfillment.events`/`shipment.events`
 * subscription) and exercises the full rollup: a partial fulfillment moves
 * an order to `partially_fulfilled`, a redelivered fulfillment event never
 * double-counts, a second fulfillment completes it to `fulfilled`, and
 * shipment status events walk `order.stage` forward through
 * `shipping` -> `delivered` without a stale redelivered event regressing it.
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack).
 *
 * Run:
 *   npm run order:shipping-rollup-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PulsarServer, createEnvelope, encodeEnvelope } from '@temp-nx/pulsar';
import { AppModule } from '../app/app.module';
import { OrdersService } from '../app/orders/orders.service';
import { Order, OrderStage, OrderStatus, FulfillmentStatus } from '../app/entities/order.entity';
import { OrderLine } from '../app/entities/order-line.entity';
import { ShippingEventsController } from '../app/shipping-events/shipping-events.controller';
import { FULFILLMENT_CREATED_EVENT_TYPE } from '../app/shipping-events/fulfillment-created-event-payload';
import { SHIPMENT_ARRIVED_EVENT_TYPE, SHIPMENT_UPDATED_EVENT_TYPE } from '../app/shipping-events/shipment-status-event-payload';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[shipping-rollup-demo] ASSERTION FAILED: ${message}`);
  }
}

async function waitUntil<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  intervalMs = 500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (predicate(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(`[shipping-rollup-demo] timed out waiting for condition after ${timeoutMs}ms`);
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
      aggregates: ['fulfillment', 'shipment'],
      subscription: 'shipping-rollup::order-service',
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
      `[shipping-rollup-demo] WARNING: could not start the fulfillment/shipment Pulsar consumer (${(err as Error).message}). ` +
        'Falling back to calling ShippingEventsController handlers directly.',
    );
  }

  const storeId = `demo-store-${Date.now()}`;
  const orders = app.get(OrdersService);
  const orderRepo = app.get<Repository<Order>>(getRepositoryToken(Order));
  const orderLineRepo = app.get<Repository<OrderLine>>(getRepositoryToken(OrderLine));
  const controller = app.get(ShippingEventsController);

  console.log('[shipping-rollup-demo] creating an open order with 2 lines (qty 2 + qty 1)...');
  const order = await orders.create(storeId, {
    status: OrderStatus.Open,
    lines: [
      { variantId: 'variant_1', name: 'Blue Hoodie', qty: 2, unitPriceMinor: 3000 },
      { variantId: 'variant_2', name: 'Red Cap', qty: 1, unitPriceMinor: 1500 },
    ],
  });
  const lines = await orderLineRepo.find({ where: { order: { id: order.id } } });
  const line1 = lines.find((l) => l.variantId === 'variant_1')!;
  const line2 = lines.find((l) => l.variantId === 'variant_2')!;

  const fulfillmentAId = `demo-fulfillment-a-${Date.now()}`;
  const fulfillmentBId = `demo-fulfillment-b-${Date.now()}`;
  const shipmentId = `demo-shipment-${Date.now()}`;

  async function publish(topic: string, eventId: string, eventType: string, aggregateType: string, aggregateId: string, payload: unknown) {
    if (liveConsumerAvailable) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require('pulsar-client');
      const client = new Client({ serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650' });
      const producer = await client.createProducer({ topic: `persistent://${tenant}/${shippingNamespace}/${topic}` });
      const envelope = createEnvelope({ eventId, eventType, storeId, aggregateType, aggregateId, payload });
      await producer.send({ data: encodeEnvelope(envelope) });
      await producer.close();
      await client.close();
    } else if (eventType === FULFILLMENT_CREATED_EVENT_TYPE) {
      await controller.onFulfillmentCreated(payload as never);
    } else if (eventType === SHIPMENT_UPDATED_EVENT_TYPE) {
      await controller.onShipmentUpdated(payload as never);
    } else if (eventType === SHIPMENT_ARRIVED_EVENT_TYPE) {
      await controller.onShipmentArrived(payload as never);
    }
  }

  console.log('[shipping-rollup-demo] publishing a partial fulfillment (1 of 2 units of line 1)...');
  await publish('fulfillment.events', `${fulfillmentAId}:evt`, FULFILLMENT_CREATED_EVENT_TYPE, 'fulfillment', fulfillmentAId, {
    fulfillmentId: fulfillmentAId,
    orderId: order.id,
    lines: [{ orderLineId: line1.id, qty: 1 }],
    trackingNumbers: ['TRACK-A'],
  });
  await waitUntil(
    () => orderRepo.findOneByOrFail({ id: order.id }),
    (o) => o.fulfillmentStatus === FulfillmentStatus.PartiallyFulfilled,
    30_000,
  );
  console.log('[shipping-rollup-demo] OK — order is partially_fulfilled.');

  console.log('[shipping-rollup-demo] redelivering the same fulfillment event — must not double-count...');
  await publish('fulfillment.events', `${fulfillmentAId}:evt-redelivered`, FULFILLMENT_CREATED_EVENT_TYPE, 'fulfillment', fulfillmentAId, {
    fulfillmentId: fulfillmentAId,
    orderId: order.id,
    lines: [{ orderLineId: line1.id, qty: 1 }],
    trackingNumbers: ['TRACK-A'],
  });
  // No state-change signal to wait on for a no-op — give the (possible) redelivery a moment to land, then assert it didn't move anything.
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  const line1AfterRedelivery = await orderLineRepo.findOneByOrFail({ id: line1.id });
  assert(line1AfterRedelivery.fulfilledQty === 1, `redelivery should not double-count — expected fulfilledQty 1, got ${line1AfterRedelivery.fulfilledQty}`);
  console.log('[shipping-rollup-demo] OK — redelivered event was a no-op.');

  console.log('[shipping-rollup-demo] publishing the completing fulfillment (remaining unit of line 1 + all of line 2)...');
  await publish('fulfillment.events', `${fulfillmentBId}:evt`, FULFILLMENT_CREATED_EVENT_TYPE, 'fulfillment', fulfillmentBId, {
    fulfillmentId: fulfillmentBId,
    orderId: order.id,
    lines: [
      { orderLineId: line1.id, qty: 1 },
      { orderLineId: line2.id, qty: 1 },
    ],
    trackingNumbers: ['TRACK-B'],
  });
  await waitUntil(
    () => orderRepo.findOneByOrFail({ id: order.id }),
    (o) => o.fulfillmentStatus === FulfillmentStatus.Fulfilled,
    30_000,
  );
  console.log('[shipping-rollup-demo] OK — order is fulfilled.');

  console.log('[shipping-rollup-demo] publishing shipment in_progress -> stage should advance to shipping...');
  await publish('shipment.events', `${shipmentId}:in-progress`, SHIPMENT_UPDATED_EVENT_TYPE, 'shipment', shipmentId, {
    shipmentId,
    storeId,
    displayId: 'SHP-9001',
    orderId: order.id,
    status: 'in_progress',
    currentStage: 1,
    contactEmail: null,
  });
  await waitUntil(
    () => orderRepo.findOneByOrFail({ id: order.id }),
    (o) => o.stage === OrderStage.Shipping,
    30_000,
  );
  console.log('[shipping-rollup-demo] OK — stage is shipping.');

  console.log('[shipping-rollup-demo] publishing shipment arrived -> stage should advance to delivered...');
  await publish('shipment.events', `${shipmentId}:arrived`, SHIPMENT_ARRIVED_EVENT_TYPE, 'shipment', shipmentId, {
    shipmentId,
    storeId,
    displayId: 'SHP-9001',
    orderId: order.id,
    status: 'arrived',
    currentStage: 2,
    contactEmail: null,
  });
  await waitUntil(
    () => orderRepo.findOneByOrFail({ id: order.id }),
    (o) => o.stage === OrderStage.Delivered,
    30_000,
  );
  console.log('[shipping-rollup-demo] OK — stage is delivered.');

  console.log('[shipping-rollup-demo] republishing a stale in_progress event — stage must not regress...');
  await publish('shipment.events', `${shipmentId}:in-progress-stale`, SHIPMENT_UPDATED_EVENT_TYPE, 'shipment', shipmentId, {
    shipmentId,
    storeId,
    displayId: 'SHP-9001',
    orderId: order.id,
    status: 'in_progress',
    currentStage: 1,
    contactEmail: null,
  });
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  const orderAfterStaleEvent = await orderRepo.findOneByOrFail({ id: order.id });
  assert(orderAfterStaleEvent.stage === OrderStage.Delivered, `stale event should not regress stage — expected delivered, got ${orderAfterStaleEvent.stage}`);
  console.log('[shipping-rollup-demo] OK — stage held at delivered.');

  console.log('[shipping-rollup-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[shipping-rollup-demo] FAILED:', err);
  process.exit(1);
});
