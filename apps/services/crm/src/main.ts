import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { PulsarServer } from '@temp-nx/pulsar';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Trust exactly one hop (the gateway) — same rationale as every other
  // service's main.ts (per-client ThrottlerGuard bucketing, IP spoofing risk
  // of `true`).
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

  // crm-service has no gRPC listener (nothing calls into it synchronously)
  // — this is its first Pulsar *consumer* connection, cross-namespace:
  // order-service's checkout saga publishes `orders.order.placed` onto its
  // own `order.events` topic. Reads ORDER_PULSAR_NAMESPACE (order's own
  // namespace var, not crm's), aggregate `order` — same
  // cross-namespace-consumption precedent as shipping's OrderEventsController.
  // Only `orders.order.placed` has a handler (OrderEventsController); every
  // other `orders.order.*` event is automatically ack-and-ignored by
  // `PulsarServer` itself. KeyShared keyed on aggregateId (the order id) —
  // per-order ordering isn't load-bearing here (every handler this
  // subscription grows is idempotent regardless of ordering), but
  // consistent with the KeyShared convention every other own-aggregate
  // subscription in this repo uses.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.ORDER_PULSAR_NAMESPACE || 'orders',
      aggregates: ['order'],
      subscription: 'order-events::crm-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.startAllMicroservices();

  const port = process.env.CRM_PORT || process.env.PORT || 3009;
  await app.listen(port);
  Logger.log(`🚀 crm-service running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
