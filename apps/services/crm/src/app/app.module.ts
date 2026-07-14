import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  AuthSharedModule,
  CustomerAuthSharedModule,
  JwtAuthGuard,
  PermissionsGuard,
  StoreContextGuard,
} from '@temp-nx/auth';
import { PulsarModule } from '@temp-nx/pulsar';
import { crmDataSourceOptions } from '../data-source';
import { HealthModule } from './health/health.module';
import { CustomersModule } from './customers/customers.module';
import { CustomerAddressesModule } from './customer-addresses/customer-addresses.module';
import { OrderEventsModule } from './order-events/order-events.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ReviewRequestsModule } from './review-requests/review-requests.module';
import { AuthModule } from './auth/auth.module';
import { StorefrontModule } from './storefront/storefront.module';
import { CustomerWishlistModule } from './customer-wishlist/customer-wishlist.module';
import { CustomerLoyaltyModule } from './customer-loyalty/customer-loyalty.module';
import { ReferralsModule } from './referrals/referrals.module';
import { SegmentsModule } from './segments/segments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(crmDataSourceOptions),
    ThrottlerModule.forRoot([
      // Same defense-in-depth backstop as every other service — the gateway
      // applies the user-facing rate limit; this is for direct/service-to-
      // service access in local dev.
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    // Zero-trust: crm-service verifies the end-user (staff) JWT itself via
    // identity's JWKS endpoint rather than trusting the gateway (ADR-6) —
    // identical wiring to catalog/inventory/payment/notification/shipping's
    // app.module.ts. Customer-facing `/storefront` endpoints use
    // CustomerAuthSharedModule below instead — a completely separate
    // strategy/JWKS, never confused with this one.
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
    // crm-service verifies its own customer tokens against its own JWKS —
    // self-referential (crm both issues these, via AuthModule's
    // KeyService/JwksController, and verifies them here), same pattern as
    // identity issuing+verifying its own staff tokens.
    CustomerAuthSharedModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        jwksUri: config.get<string>('CRM_JWKS_URI', 'http://localhost:3009/api/auth/jwks'),
        issuer: config.get<string>('CRM_JWT_ISSUER', 'ecomiq-crm-customer'),
      }),
    }),
    // Registers PulsarProducerService + the outbox relay poller for
    // crm-service's own domain events (customer/review/loyalty/referral/
    // segment events, and notify.send commands). The event *consumer*
    // connection (orders.order.placed, cross-namespace) is wired separately
    // in main.ts — NestJS custom transporters aren't DI providers.
    PulsarModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        serviceUrl: config.get<string>('PULSAR_SERVICE_URL', 'pulsar://localhost:6650'),
        tenant: config.get<string>('PULSAR_TENANT', 'ecomiq'),
        namespace: config.get<string>('CRM_PULSAR_NAMESPACE', 'crm'),
        authToken: config.get<string | undefined>('PULSAR_AUTH_TOKEN', undefined),
      }),
    }),
    HealthModule,
    // Customer CRUD + nested address CRUD — the first real domain module.
    CustomersModule,
    CustomerAddressesModule,
    // orders.order.placed consumer (cross-namespace) -> rollup (and, in
    // later steps, loyalty accrual + referral completion).
    OrderEventsModule,
    // Reviews + moderation (pending -> published -> archived).
    ReviewsModule,
    // Review requests -> notify.send (template review_request), linked to
    // a review when a matching one is later created.
    ReviewRequestsModule,
    // Customer auth core: RS256 keypair + JWKS, register/login/refresh with
    // rotating refresh tokens (crm's own Redis-backed reuse-detection,
    // separate from identity's staff session Redis keys).
    AuthModule,
    // Customer-facing /storefront REST (own profile, own addresses, post a
    // review) — CustomerJwtGuard-gated, never PermissionsGuard.
    StorefrontModule,
    // Admin read-only wishlist tab (Customer 360) — add/remove is customer-
    // initiated only, via StorefrontModule.
    CustomerWishlistModule,
    // Admin loyalty account view + manual adjustment (Customer 360 tab).
    CustomerLoyaltyModule,
    // Referral code generation + admin list; completion handler wired into
    // OrderEventsModule below.
    ReferralsModule,
    // Rule-based materialized segments — manual evaluate only.
    SegmentsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Must come after JwtAuthGuard in this array (guard order follows
    // provider order): asserts `req.user.storeId` exists and stamps
    // `req.storeId` — same ordering rule as every other service.
    { provide: APP_GUARD, useClass: StoreContextGuard },
    // Not a global APP_GUARD — applied per-controller via
    // `@UseGuards(PermissionsGuard)` + `@RequirePermissions('people:...')`,
    // starting with the customer CRUD controller.
    PermissionsGuard,
  ],
})
export class AppModule {}
