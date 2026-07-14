import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthSharedModule, JwtAuthGuard, PermissionsGuard, StoreContextGuard } from '@temp-nx/auth';
import { PulsarModule } from '@temp-nx/pulsar';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { marketingDataSourceOptions } from '../data-source';
import { HealthModule } from './health/health.module';
import { DiscountsModule } from './discounts/discounts.module';
import { OrderSyncModule } from './order-sync/order-sync.module';
import { SegmentSyncModule } from './segment-sync/segment-sync.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { AdsModule } from './ads/ads.module';
import { PopupsModule } from './popups/popups.module';
import { FormsModule } from './forms/forms.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(marketingDataSourceOptions),
    ThrottlerModule.forRoot([
      // Same defense-in-depth backstop as identity/catalog/inventory — the
      // gateway applies the user-facing rate limit; this is for
      // direct/service-to-service access in local dev.
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    // Zero-trust: marketing-service verifies the end-user JWT itself via
    // identity's JWKS endpoint rather than trusting the gateway (ADR-6) —
    // identical wiring to catalog/inventory's app.module.ts.
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
    // marketing-service's own domain events (marketing.discount.*,
    // marketing.campaign.*). Producer/outbox-relay side only — harmless
    // before any outbox rows exist; the order-events and campaign-fire
    // PulsarServer consumer connections are registered separately in
    // main.ts.
    PulsarModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        serviceUrl: config.get<string>('PULSAR_SERVICE_URL', 'pulsar://localhost:6650'),
        tenant: config.get<string>('PULSAR_TENANT', 'ecomiq'),
        namespace: config.get<string>('MARKETING_PULSAR_NAMESPACE', 'marketing'),
        authToken: config.get<string | undefined>('PULSAR_AUTH_TOKEN', undefined),
      }),
    }),
    HealthModule,
    // Discount CRUD (checkout saga dependency); ValidateDiscount gRPC
    // lives inside this same module.
    DiscountsModule,
    // orders.order.placed/canceled consumer (the only writer of
    // DiscountUsage).
    OrderSyncModule,
    // crm.segment.updated consumer (the only writer of segment_snapshot) —
    // registered before CampaignsModule since campaign send-time
    // recipient resolution reads from that snapshot.
    SegmentSyncModule,
    // Campaign entities + CRUD. Scheduled sends and ads/popups/forms build
    // on top of this module.
    CampaignsModule,
    // Ads (logging-stub AdPlatformPort), popups, and forms (+ the one
    // public form-submission route).
    AdsModule,
    PopupsModule,
    FormsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Must come after JwtAuthGuard in this array (guard order follows
    // provider order): asserts `req.user.storeId` exists and stamps
    // `req.storeId` — same ordering rule as catalog/inventory.
    { provide: APP_GUARD, useClass: StoreContextGuard },
    // Not a global APP_GUARD — applied per-controller via
    // `@UseGuards(PermissionsGuard)` + `@RequirePermissions(...)`, same
    // pattern as catalog/inventory/api-gateway.
    PermissionsGuard,
  ],
})
export class AppModule {}
