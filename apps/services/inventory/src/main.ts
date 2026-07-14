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

  // Hybrid app: HTTP (above) + a Pulsar-consuming microservice
  // (below), same NestJS instance. This is the *consumer* side of Pulsar;
  // PulsarModule (registered in app.module.ts) is the producer/outbox-relay
  // side — the two are independent, a service can have either, neither, or
  // both. Subscribes to catalog-service's product.events topic, namespace
  // read from CATALOG_PULSAR_NAMESPACE (catalog's own namespace var, not
  // inventory's — we're consuming *its* topic here, not publishing to ours).
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.CATALOG_PULSAR_NAMESPACE || 'catalog',
      aggregates: ['product'],
      // "<topic-base>::<consumer-service>" — the subscription-per-consumer-
      // service convention every consumer in this repo follows.
      subscription: 'product-events::inventory-service',
      // Key_Shared (keyed on aggregateId, i.e. productId — see
      // PulsarProducerService.publish's partitionKey) so product/variant
      // ordering per product is preserved even once inventory-service scales
      // to multiple instances, not just correct for a single instance today.
      subscriptionType: 'KeyShared',
      // See PulsarModuleOptions.authToken's doc comment; undefined in dev
      // (unset env var) means no change from today's unauthenticated
      // connection.
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // A *second* Pulsar-consuming microservice, this one on
  // inventory's own namespace: ReservationsService.create()
  // publishes a delayed `inventory.reservation.expiry-check` trigger
  // (deliverAt = reservedUntil) onto its own reservation.events topic, and
  // this subscription is what receives it once Pulsar finally delivers it,
  // dispatching to ReservationExpiryController.onExpiryCheck(). Needs its
  // own `connectMicroservice` call (not folded into the one above) because
  // a single PulsarServer instance subscribes to topics in exactly one
  // namespace, and this topic lives in inventory's own namespace, not
  // catalog's.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.INVENTORY_PULSAR_NAMESPACE || 'inventory',
      aggregates: ['reservation'],
      subscription: 'reservation-expiry::inventory-service',
      // Key_Shared keyed on aggregateId (the reservation id, per
      // PulsarProducerService.publish's partitionKey) — not load-bearing for
      // correctness here (expire() is idempotent regardless of ordering),
      // but consistent with the KeyShared convention established above.
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // A *third* microservice connection, this
  // one gRPC rather than Pulsar: order-service's checkout saga calls
  // ReserveStock/ReleaseReservation synchronously (ADR-7/ADR-8), so it needs
  // a request/response transport, not an event stream. Same hybrid-app
  // pattern as the two PulsarServer connections above — independent of
  // them (a service can mix any combination of HTTP/Pulsar/gRPC).
  // ReservationGrpcController (reservations.module.ts) is what actually
  // handles calls; NestJS's grpc-js strategy loads the .proto at runtime via
  // @grpc/proto-loader and dispatches by service+method name to whichever
  // controller registered a matching `@GrpcMethod`.
  app.connectMicroservice({
    transport: Transport.GRPC,
    options: {
      package: 'ecomiq.inventory.v1',
      protoPath: join(process.cwd(), 'libs/contracts/proto/inventory/v1/reservation.proto'),
      url: `0.0.0.0:${process.env.INVENTORY_GRPC_PORT || 50051}`,
    },
  });

  // A *fourth* microservice connection: order-service's own `orders`
  // namespace, aggregates ['order'],
  // dispatching `orders.order.placed`/`.canceled` to OrderSyncController.
  // Same cross-service-consumer shape as the very first connection above
  // (catalog's `product.events`), just a different producer.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.ORDER_PULSAR_NAMESPACE || 'orders',
      aggregates: ['order'],
      subscription: 'order-events::inventory-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // A *fifth* microservice connection: purchasing-service's own
  // `purchasing` namespace, aggregates ['po'], dispatching
  // `purchasing.po.received` to PurchasingSyncController. Same
  // cross-service-consumer shape as the order-events connection above, just
  // a different producer/aggregate.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.PURCHASING_PULSAR_NAMESPACE || 'purchasing',
      aggregates: ['po'],
      subscription: 'po-events::inventory-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.startAllMicroservices();

  const port = process.env.INVENTORY_PORT || process.env.PORT || 3003;
  await app.listen(port);
  Logger.log(`🚀 inventory-service running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
