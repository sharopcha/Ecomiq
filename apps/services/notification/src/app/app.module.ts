import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthSharedModule, JwtAuthGuard, PermissionsGuard, StoreContextGuard } from '@temp-nx/auth';
import { PulsarModule } from '@temp-nx/pulsar';
import { notificationDataSourceOptions } from '../data-source';
import { HealthModule } from './health/health.module';
import { TemplatesModule } from './templates/templates.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChannelsModule } from './channels/channels.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { NotifyCommandsModule } from './notify-commands/notify-commands.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { StockLowModule } from './stock-low/stock-low.module';
import { ReturnEventsModule } from './return-events/return-events.module';
import { ShippingEventsModule } from './shipping-events/shipping-events.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(notificationDataSourceOptions),
    ThrottlerModule.forRoot([
      // Same defense-in-depth backstop as every other service — the
      // gateway applies the user-facing rate limit; this is for
      // direct/service-to-service access in local dev.
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    // Zero-trust: notification-service verifies the end-user JWT itself via
    // identity's JWKS endpoint rather than trusting the gateway (ADR-6) —
    // identical wiring to catalog/inventory/payment's app.module.ts.
    AuthSharedModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        jwksUri: config.get<string>(
          'JWKS_URI',
          'http://localhost:3001/api/.well-known/jwks.json',
        ),
        issuer: config.get<string>('JWT_ISSUER', 'ecomiq-identity'),
      }),
    }),
    // Registers PulsarProducerService + the outbox relay poller for
    // notification-service's own domain events (notify.message.sent/failed).
    // The `notify.send`/domain-event *consumer* connections (marketing's
    // notify.commands, inventory's stock_level.events, orders' return.events)
    // are wired separately in main.ts starting in Step 6 — this service is
    // async-only, no gRPC listener.
    PulsarModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        serviceUrl: config.get<string>('PULSAR_SERVICE_URL', 'pulsar://localhost:6650'),
        tenant: config.get<string>('PULSAR_TENANT', 'ecomiq'),
        namespace: config.get<string>('NOTIFICATION_PULSAR_NAMESPACE', 'notify'),
        authToken: config.get<string | undefined>('PULSAR_AUTH_TOKEN', undefined),
      }),
    }),
    HealthModule,
    // Email template CRUD + rendering (the first tenant-scoped, permission-
    // gated domain module — exercises the StoreContextGuard/PermissionsGuard
    // wiring laid down in Step 1).
    TemplatesModule,
    // In-app notification feed (the bell badge). NotificationsService.push()
    // is exported for Step 5's InAppChannel.
    NotificationsModule,
    // Channel ports + mock adapters (email/SMS/WhatsApp) + InAppChannel.
    // No caller yet — Step 6's DispatchService is the first consumer.
    ChannelsModule,
    // Dispatch pipeline (DispatchService) + the delayed-retry self-message
    // consumer (MessageRetryController) — the first consumer entry point
    // Steps 7/9/10 will each call into.
    DispatchModule,
    // The notify.send command consumer (marketing's namespace, cross-service) —
    // the real replacement for the marketing:notify-tail debug stand-in.
    NotifyCommandsModule,
    // Provider webhook receiver (bounce/open/click) -> marketing engagement forward.
    WebhooksModule,
    // inventory.stock.low consumer (cross-namespace) -> staff email/in-app/SMS fan-out.
    StockLowModule,
    // orders.return.approved consumer (cross-namespace) -> customer RMA-approval email.
    ReturnEventsModule,
    // shipping.shipment.delayed consumer (cross-namespace) -> customer delay email.
    ShippingEventsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Must come after JwtAuthGuard in this array (guard order follows
    // provider order): asserts `req.user.storeId` exists and stamps
    // `req.storeId` — same ordering rule as catalog/inventory/payment.
    // Nothing needs it yet (Step 1 has no tenant-scoped controllers), but
    // every domain module from Step 3 onward will.
    { provide: APP_GUARD, useClass: StoreContextGuard },
    // Not a global APP_GUARD — applied per-controller via
    // `@UseGuards(PermissionsGuard)` + `@RequirePermissions('notifications:...')`
    // once Step 3's templates controller lands.
    PermissionsGuard,
  ],
})
export class AppModule {}
