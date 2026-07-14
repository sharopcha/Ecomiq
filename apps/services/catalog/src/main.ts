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

  // Trust exactly one hop (the gateway).
  // See the matching comment in identity-service's main.ts for the full
  // rationale (per-client ThrottlerGuard bucketing, IP spoofing risk of `true`).
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

  // catalog-service's first Pulsar *consumer* connection (it has only ever
  // been a producer until now): cross-namespace, cross-service subscription
  // to crm-service's own `review.events` topic. Only `crm.review.published`/
  // `crm.review.archived` have handlers (CatalogSyncController); every other
  // `crm.review.*` event (e.g. `crm.review.created`) is automatically
  // ack-and-ignored by `PulsarServer` itself. KeyShared keyed on
  // aggregateId (the review id) — same convention as every other
  // own-aggregate subscription in this repo.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.CRM_PULSAR_NAMESPACE || 'crm',
      aggregates: ['review'],
      subscription: 'review-events::catalog-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.startAllMicroservices();

  const port = process.env.CATALOG_PORT || process.env.PORT || 3002;
  await app.listen(port);
  Logger.log(`🚀 catalog-service running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
