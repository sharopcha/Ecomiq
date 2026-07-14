import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { PulsarServer } from '@temp-nx/pulsar';
import { AppModule } from './app/app.module';

async function bootstrap() {
  // `rawBody: true` — NestJS's built-in raw-body capture (`req.rawBody`),
  // same as payment's/notification's main.ts. Buffers the raw bytes
  // alongside normal body parsing for every route; only the tracking
  // webhook controller actually reads `req.rawBody` (HMAC verification
  // must run on the exact signed bytes, before any JSON parsing).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Trust exactly one hop (the gateway) — same rationale as every other
  // service's main.ts (per-client ThrottlerGuard bucketing, IP spoofing
  // risk of `true`).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // shipping-service has no gRPC listener (nothing calls into it
  // synchronously) — this is its first Pulsar *consumer* connection,
  // cross-namespace: order-service's checkout saga publishes
  // `orders.order.placed` onto its own `order.events` topic. Reads
  // ORDER_PULSAR_NAMESPACE (order's own namespace var, not shipping's),
  // aggregate `order` — same cross-namespace-consumption precedent as
  // notification's ReturnEventsController subscribing to order's
  // return.events. Only `orders.order.placed` has a handler
  // (OrderEventsController); every other `orders.order.*` event is
  // automatically ack-and-ignored by `PulsarServer` itself. Key_Shared
  // keyed on aggregateId (the order id) — per-order ordering isn't load-
  // bearing here (the auto-draft handler is idempotent regardless of
  // ordering), but consistent with the KeyShared convention every other
  // own-aggregate subscription in this repo uses.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.ORDER_PULSAR_NAMESPACE || 'orders',
      aggregates: ['order'],
      subscription: 'order-events::shipping-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // A *second* Pulsar-consuming microservice, this one on shipping-service's
  // own namespace: `ShipmentsService.transition()` arms a self-consumed
  // `shipping.shipment.delay_check` delayed message (`deliverAt =
  // expectedArrivalAt`) when a shipment enters `in_progress`. Key_Shared
  // keyed on aggregateId (the shipment id) — not load-bearing for
  // correctness (`handleDelayCheck` is idempotent regardless of ordering),
  // but consistent with the KeyShared convention every other own-aggregate
  // subscription in this repo uses.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.SHIPPING_PULSAR_NAMESPACE || 'shipping',
      aggregates: ['shipment'],
      subscription: 'shipment-delay::shipping-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // A *third* Pulsar-consuming microservice, own namespace again:
  // `PickupsService.scheduleBulk()` arms a self-consumed
  // `shipping.pickup.reminder_check` delayed message (`deliverAt` = pickup
  // morning) per scheduled row. Key_Shared keyed on aggregateId (the
  // pickup id) — same convention as the other own-aggregate subscriptions.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.SHIPPING_PULSAR_NAMESPACE || 'shipping',
      aggregates: ['pickup'],
      subscription: 'pickup-reminder::shipping-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.startAllMicroservices();

  const port = process.env.SHIPPING_PORT || process.env.PORT || 3008;
  await app.listen(port);
  Logger.log(`🚀 shipping-service running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
