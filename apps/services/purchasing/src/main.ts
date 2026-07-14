import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { PulsarServer } from '@temp-nx/pulsar';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

  // purchasing-service has no gRPC listener (nothing calls into it
  // synchronously) — PulsarModule in app.module.ts registers the producer/
  // outbox relay for this service's own domain events. This is its first
  // Pulsar *consumer* connection: inventory-service's own `inventory`
  // namespace, aggregates ['stock_level'] (every inventory.stock.*/
  // inventory.reorder.* event rides that one aggregate stream — see
  // inventory's `STOCK_LEVEL_AGGREGATE_TYPE` doc comment), dispatching
  // `inventory.reorder.triggered` to AutoDraftPoController. Key_Shared
  // keyed on aggregateId (the stock_level id) — not load-bearing for
  // correctness (`applyReorderTriggered` is idempotent regardless of
  // ordering, via the partial unique index), but consistent with the
  // KeyShared convention every other cross-service subscription in this
  // repo uses.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.INVENTORY_PULSAR_NAMESPACE || 'inventory',
      aggregates: ['stock_level'],
      subscription: 'reorder-triggered::purchasing-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.startAllMicroservices();

  const port = process.env.PURCHASING_PORT || process.env.PORT || 3010;
  await app.listen(port);
  Logger.log(`🚀 purchasing-service running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
