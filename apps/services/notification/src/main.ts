import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { PulsarServer, topicForCommands } from '@temp-nx/pulsar';
import { AppModule } from './app/app.module';

async function bootstrap() {
  // NestJS's built-in raw-body capture (`req.rawBody`), not a hand-rolled
  // `express.raw()` scoped to one path — same as payment's main.ts.
  // `rawBody: true` makes Nest additionally buffer the raw bytes alongside
  // its normal body-parser middleware for *every* route; only
  // `webhooks.controller.ts`'s handler actually reads `req.rawBody`.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Trust exactly one hop (the gateway) — same rationale as
  // identity/payment's main.ts (per-client ThrottlerGuard bucketing, IP
  // spoofing risk of `true`).
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

  // notification-service is async-only (no gRPC listener, nothing calls
  // into it synchronously) — but it both publishes AND consumes its own
  // `notify/message.events` topic: DispatchService's retry path arms a
  // delayed `notify.message.retry` self-message (deliverAt = now +
  // backoff), and this is the subscription that receives it once Pulsar
  // finally delivers it, dispatching to
  // MessageRetryController.onRetry() — same self-consumed-delayed-message
  // pattern as inventory's reservation auto-expiry. Cross-namespace
  // consumer connections (inventory's stock_level.events below, orders'
  // return.events in Step 10) round out the full set.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.NOTIFICATION_PULSAR_NAMESPACE || 'notify',
      aggregates: ['message'],
      subscription: 'message-retry::notification-service',
      // Key_Shared keyed on aggregateId (the send_log id, per
      // PulsarProducerService.publish's partitionKey) — not load-bearing
      // for correctness here (redispatch() is idempotent regardless of
      // ordering), but consistent with the KeyShared convention every
      // other own-aggregate subscription in this repo uses.
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // A *second* Pulsar-consuming microservice, this one cross-namespace:
  // marketing's campaign fire and order's refund settlement/failure both
  // publish `notify.send` commands onto marketing's own `notify.commands`
  // topic (an explicit outbox `topic` override on their end — see
  // campaigns.service.ts's/refunds.service.ts's own comments), not
  // anywhere in notification's own `notify` namespace. Reads
  // MARKETING_PULSAR_NAMESPACE (marketing's own namespace var, not
  // notification's) — same cross-namespace-consumption precedent as
  // inventory's CatalogSyncController subscribing to catalog's topic; the
  // tenant-level agreement is on *where the producers publish*.
  // NotifyCommandsController (notify-commands.module.ts) is what actually
  // handles the command. Shared subscription type: commands don't need
  // per-key ordering, same choice payment's RefundCommandsController made.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.MARKETING_PULSAR_NAMESPACE || 'marketing',
      aggregates: [],
      topics: [
        topicForCommands(
          process.env.PULSAR_TENANT || 'ecomiq',
          process.env.MARKETING_PULSAR_NAMESPACE || 'marketing',
          'notify',
        ),
      ],
      subscription: 'notify-commands::notification-service',
      subscriptionType: 'Shared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // A *third* Pulsar-consuming microservice, cross-namespace again:
  // inventory-service's low-stock crossing check publishes
  // `inventory.stock.low` (carrying the matched alert's `actions[]`) onto
  // its own `stock_level.events` topic. Reads INVENTORY_PULSAR_NAMESPACE
  // (inventory's own namespace var), aggregate `stock_level` — same
  // cross-namespace precedent as the two connections above.
  // `inventory.stock.adjusted`/`inventory.reorder.triggered` also land on
  // this same topic and are automatically ack-and-ignored by `PulsarServer`
  // itself (no `@EventPattern` registered for them here).
  // StockLowController (stock-low.module.ts) is what actually handles it.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.INVENTORY_PULSAR_NAMESPACE || 'inventory',
      aggregates: ['stock_level'],
      subscription: 'stock-level-events::notification-service',
      // Key_Shared keyed on aggregateId (stockLevelId) — per-cell ordering
      // isn't load-bearing here (each fan-out action dedupes independently
      // via its own `{eventId}:{action}` sourceEventId), but consistent
      // with the KeyShared convention every other own-aggregate
      // subscription in this repo uses.
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // A *fourth* Pulsar-consuming microservice, cross-namespace again:
  // order-service's return approval publishes `orders.return.approved`
  // (and every other `orders.return.*` transition) onto its own
  // `return.events` topic. Reads ORDER_PULSAR_NAMESPACE (order's own
  // namespace var), aggregate `return` — same cross-namespace precedent as
  // the three connections above. Only `orders.return.approved` has a
  // handler (`ReturnEventsController`); every other return transition is
  // automatically ack-and-ignored by `PulsarServer` itself.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.ORDER_PULSAR_NAMESPACE || 'orders',
      aggregates: ['return'],
      subscription: 'return-events::notification-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  // A *fifth* Pulsar-consuming microservice, cross-namespace again:
  // shipping-service publishes `shipping.shipment.delayed` (and every
  // other `shipping.shipment.*` transition, plus its own self-consumed
  // `shipping.shipment.delay_check`) onto its own `shipment.events` topic.
  // Reads SHIPPING_PULSAR_NAMESPACE (shipping's own namespace var),
  // aggregate `shipment` — same cross-namespace precedent as the four
  // connections above. Only `shipping.shipment.delayed` has a handler
  // (`ShippingEventsController`); everything else on this topic is
  // automatically ack-and-ignored by `PulsarServer` itself.
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.SHIPPING_PULSAR_NAMESPACE || 'shipping',
      aggregates: ['shipment'],
      subscription: 'shipment-events::notification-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.startAllMicroservices();

  const port = process.env.NOTIFICATION_PORT || process.env.PORT || 3007;
  await app.listen(port);
  Logger.log(`🚀 notification-service running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
