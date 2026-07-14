import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthSharedModule, CustomerAuthSharedModule, JwtAuthGuard, PermissionsGuard, StoreContextGuard } from '@temp-nx/auth';
import { PulsarModule } from '@temp-nx/pulsar';
import { orderDataSourceOptions } from '../data-source';
import { HealthModule } from './health/health.module';
import { OrdersModule } from './orders/orders.module';
import { OrderCommentsModule } from './comments/order-comments.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ReturnsModule } from './returns/returns.module';
import { CheckoutSagaModule } from './checkout/saga/checkout-saga.module';
import { RefundsModule } from './refunds/refunds.module';
import { ShippingEventsModule } from './shipping-events/shipping-events.module';
import { StorefrontModule } from './storefront/storefront.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(orderDataSourceOptions),
    ThrottlerModule.forRoot([
      // Same defense-in-depth backstop as identity/catalog/inventory — the
      // gateway applies the user-facing rate limit; this is for
      // direct/service-to-service access in local dev.
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    // Zero-trust: order-service verifies the end-user JWT itself via
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
    CustomerAuthSharedModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        jwksUri: config.get<string>(
          'CRM_JWKS_URI',
          'http://localhost:3003/api/.well-known/jwks.json',
        ),
        issuer: config.get<string>('CUSTOMER_JWT_ISSUER', 'ecomiq-crm'),
      }),
    }),
    // Registers PulsarProducerService + the outbox relay poller for
    // order-service's own domain events (orders.order.*, orders.return.*).
    // Producer/outbox-relay side only — harmless before any outbox rows
    // exist; the PulsarServer consumer connections (payments/inventory
    // event subscriptions) are registered separately in main.ts.
    PulsarModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        serviceUrl: config.get<string>('PULSAR_SERVICE_URL', 'pulsar://localhost:6650'),
        tenant: config.get<string>('PULSAR_TENANT', 'ecomiq'),
        namespace: config.get<string>('ORDER_PULSAR_NAMESPACE', 'orders'),
        authToken: config.get<string | undefined>('PULSAR_AUTH_TOKEN', undefined),
      }),
    }),
    HealthModule,
    // ReturnsModule (its own static `/returns` base) must be registered
    // before OrdersModule (whose `GET/PATCH/POST /:id` is a bare
    // single-segment wildcard) — Nest registers HTTP routes in module
    // discovery order, and a dynamic `:id` param route registered first
    // would otherwise swallow `/returns` as if "returns" were an order id
    // (found via a live gateway smoke test: `GET /api/orders/returns`
    // 404'd with "Order returns not found" instead of reaching
    // ReturnsController). Same static-before-wildcard ordering principle
    // as the gateway's own `@All()`-before-`@All('*path')` fix — just
    // expressed via module order instead of route order since these are
    // two separate controllers, not one.
    ReturnsModule,
    // Orders CRUD/lifecycle, order-scoped comments, invoices.
    OrdersModule,
    OrderCommentsModule,
    InvoicesModule,
    // Saga infrastructure — includes the checkout endpoint
    // (POST /:id/checkout). Registering it is safe: gRPC channel creation
    // is lazy (no connection attempt until the first real RPC), so this
    // boots fine without inventory/payment/marketing's gRPC listeners
    // reachable.
    CheckoutSagaModule,
    // Refund decisioning. RefundsController's base ('refunds') is 3+
    // segments deep on every route, so unlike ReturnsModule it has no
    // bare-`/:id`-collision risk regardless of registration order.
    RefundsModule,
    // Cross-namespace consumer of shipping-service's `fulfillment.events`/
    // `shipment.events` — registers `ShippingEventsController`. The real
    // Pulsar consumer connection lives in main.ts, same split as every
    // other event-consuming module here.
    ShippingEventsModule,
    StorefrontModule,
  ],
  providers: [
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
