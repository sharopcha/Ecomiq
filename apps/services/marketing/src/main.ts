import 'reflect-metadata';
import { join } from 'path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { PulsarServer } from '@temp-nx/pulsar';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Trust exactly one hop (the gateway). See the matching comment in
  // identity-service's main.ts for the full rationale (per-client
  // ThrottlerGuard bucketing, IP spoofing risk of `true`).
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

  // A gRPC microservice connection alongside the HTTP listener above
  // (same hybrid-app pattern as inventory/payment's main.ts):
  // order-service's checkout saga calls ValidateDiscount synchronously
  // (ADR-7), so it needs a request/response transport, not an event
  // stream. DiscountGrpcController (discounts.module.ts) is what actually
  // handles calls.
  app.connectMicroservice({
    transport: Transport.GRPC,
    options: {
      package: 'ecomiq.marketing.v1',
      protoPath: join(process.cwd(), 'libs/contracts/proto/marketing/v1/discount.proto'),
      url: `0.0.0.0:${process.env.MARKETING_GRPC_PORT || 50052}`,
      // loader.longs/defaults — same fix payment-service needed for its
      // amount_minor (int64): @grpc/proto-loader's runtime decode (what
      // NestJS's gRPC server actually dispatches through, independent of
      // ts-proto's client-side encode/decode) doesn't fill in proto3
      // scalar zero-value defaults and represents int64 as `Long` objects
      // by default. This proto's `subtotal_minor`/`discount_minor` are
      // int64 — applying the same fix proactively rather than
      // rediscovering the bug (see payment/src/main.ts's doc comment for
      // the full story).
      loader: { longs: Number, defaults: true },
    },
  });

  // A *second* Pulsar-consuming microservice, this one on order-service's
  // namespace (`orders`, not marketing's own): the discount usage consumer
  // needs `orders.order.placed`/`.canceled` to record/release
  // `DiscountUsage` rows. Same hybrid-app pattern (multiple independent
  // connectMicroservice calls) as inventory's main.ts documents for its own
  // two Pulsar connections.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.ORDER_PULSAR_NAMESPACE || 'orders',
      aggregates: ['order'],
      // "<topic-base>::<consumer-service>" — repo-wide
      // subscription-per-consumer-service convention.
      subscription: 'order-events::marketing-service',
      // Key_Shared (keyed on aggregateId, i.e. orderId) so per-order
      // ordering (placed before a later cancel) is preserved even once
      // marketing-service scales to multiple instances.
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // The campaign-fire consumer: marketing-service subscribing to its
  // **own** `marketing` namespace for the `campaign` aggregate, distinct
  // from the `orders`-namespace consumer above. Carries the self-addressed
  // delayed `marketing.campaign.fire` message `CampaignsService.schedule()`
  // produces (deliverAt = scheduleAt) — same shape as order-service's
  // `order-self-events::order-service` connection for its own delayed
  // messages.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.MARKETING_PULSAR_NAMESPACE || 'marketing',
      aggregates: ['campaign'],
      subscription: 'campaign-events::marketing-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // A *third* Pulsar-consuming microservice: crm-service's namespace
  // (`crm`, cross-service, same as the `orders` connection above but a
  // different producer entirely) for the `segment` aggregate —
  // `SegmentSyncController` upserts `segment_snapshot` from
  // `crm.segment.updated`. Same cross-namespace consumer shape as
  // catalog-service's own `review-events::catalog-service` connection.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.CRM_PULSAR_NAMESPACE || 'crm',
      aggregates: ['segment'],
      subscription: 'segment-events::marketing-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.startAllMicroservices();

  const port = process.env.MARKETING_PORT || process.env.PORT || 3006;
  await app.listen(port);
  Logger.log(`🚀 marketing-service running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
