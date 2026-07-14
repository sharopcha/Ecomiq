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

  // order-service consuming its **own** events: the RMA auto-expiry
  // delayed message (`return` aggregate, `orders.return.expiry_check`) and
  // the checkout payment-timeout delayed message (`order` aggregate,
  // `orders.order.payment_timeout`) both ride this one connection —
  // `aggregates` is a list, and a single `PulsarServer` subscribes to
  // topics in exactly one namespace, so two self-addressed delayed
  // messages under the same `orders` namespace share this connection
  // rather than each getting its own (mirrors inventory's
  // ReservationExpiryController pattern, just with two aggregates instead
  // of one). Renamed from `return-expiry::order-service` now that it
  // covers more than returns.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.ORDER_PULSAR_NAMESPACE || 'orders',
      aggregates: ['return', 'order'],
      subscription: 'order-self-events::order-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // The checkout saga's payment-result consumer: payment-service
  // publishes `payments.payment.succeeded`/`.failed` on its own `payments`
  // namespace; this is order-service subscribing to *another*
  // service's topic, same cross-service consumer shape as marketing's
  // `orders` subscription.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.PAYMENT_PULSAR_NAMESPACE || 'payments',
      aggregates: ['payment'],
      subscription: 'payment-events::order-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // The other half of inventory integration: order-service
  // subscribes to inventory-service's own `inventory` namespace for
  // `inventory.reservation.expired`, so a reservation that outlasts the
  // checkout payment window compensates its still-awaiting_payment saga
  // instead of leaking a paid-but-unreserved order. Inventory's own
  // `orders`-namespace consumer (committing/releasing reservations) lives
  // in inventory-service's main.ts, not here.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.INVENTORY_PULSAR_NAMESPACE || 'inventory',
      aggregates: ['reservation'],
      subscription: 'reservation-expired::order-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // The other half of shipping integration: order-service subscribes to
  // shipping-service's own `shipping` namespace for `fulfillment.events`
  // (rolling up `order.fulfillmentStatus`) and `shipment.events` (advancing
  // `order.stage` on in-transit/arrived) — one connection for both since
  // they're the same namespace, same "aggregates is a list" reasoning as
  // the self-events connection above.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.SHIPPING_PULSAR_NAMESPACE || 'shipping',
      aggregates: ['fulfillment', 'shipment'],
      subscription: 'shipping-rollup::order-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.startAllMicroservices();

  const port = process.env.ORDER_PORT || process.env.PORT || 3004;
  await app.listen(port);
  Logger.log(`🚀 order-service running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
