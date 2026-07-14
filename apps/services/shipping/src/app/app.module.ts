import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthSharedModule, JwtAuthGuard, PermissionsGuard, StoreContextGuard } from '@temp-nx/auth';
import { PulsarModule } from '@temp-nx/pulsar';
import { shippingDataSourceOptions } from '../data-source';
import { HealthModule } from './health/health.module';
import { PackagePresetsModule } from './package-presets/package-presets.module';
import { LabelsModule } from './labels/labels.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { OrderEventsModule } from './order-events/order-events.module';
import { FulfillmentsModule } from './fulfillments/fulfillments.module';
import { TrackingWebhookModule } from './tracking-webhook/tracking-webhook.module';
import { PickupsModule } from './pickups/pickups.module';
import { ShipmentNotifyModule } from './shipment-notify/shipment-notify.module';
import { TrackingModule } from './tracking/tracking.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(shippingDataSourceOptions),
    ThrottlerModule.forRoot([
      // Same defense-in-depth backstop as every other service — the
      // gateway applies the user-facing rate limit; this is for
      // direct/service-to-service access in local dev.
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    // Zero-trust: shipping-service verifies the end-user JWT itself via
    // identity's JWKS endpoint rather than trusting the gateway (ADR-6) —
    // identical wiring to catalog/inventory/payment/notification's
    // app.module.ts.
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
    // shipping-service's own domain events (shipment/label/fulfillment/
    // pickup events). The event *consumer* connections (orders'
    // order.placed below, shipping's own future delayed self-messages)
    // are wired separately in main.ts.
    PulsarModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        serviceUrl: config.get<string>('PULSAR_SERVICE_URL', 'pulsar://localhost:6650'),
        tenant: config.get<string>('PULSAR_TENANT', 'ecomiq'),
        namespace: config.get<string>('SHIPPING_PULSAR_NAMESPACE', 'shipping'),
        authToken: config.get<string | undefined>('PULSAR_AUTH_TOKEN', undefined),
      }),
    }),
    HealthModule,
    // Package presets ("save this package for future use") and shipping
    // label drafts, each store-scoped CRUD under the `shipments` workspace.
    PackagePresetsModule,
    LabelsModule,
    // Shipment lifecycle + event timeline, its own workspace distinct from
    // the order it ships.
    ShipmentsModule,
    // orders.order.placed consumer (cross-namespace) -> auto-draft shipment.
    OrderEventsModule,
    // Fulfillment execution + tracking numbers.
    FulfillmentsModule,
    // Signed carrier tracking webhook -> shipment timeline + arrival.
    TrackingWebhookModule,
    // Bulk pickup scheduling + its reminder-check delayed message.
    PickupsModule,
    // Shipment Notification composer (WhatsApp/Email/SMS).
    ShipmentNotifyModule,
    // Public, unauthenticated tracking page — the one route in this service
    // reachable without a JWT.
    TrackingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Must come after JwtAuthGuard in this array (guard order follows
    // provider order): asserts `req.user.storeId` exists and stamps
    // `req.storeId` — same ordering rule as every other service.
    { provide: APP_GUARD, useClass: StoreContextGuard },
    // Not a global APP_GUARD — applied per-controller via
    // `@UseGuards(PermissionsGuard)` + `@RequirePermissions('shipments:...')`,
    // see package-presets/labels controllers below.
    PermissionsGuard,
  ],
})
export class AppModule {}
