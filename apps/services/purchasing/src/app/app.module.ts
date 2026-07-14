import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthSharedModule, JwtAuthGuard, PermissionsGuard, StoreContextGuard, SupplierAuthSharedModule } from '@temp-nx/auth';
import { PulsarModule } from '@temp-nx/pulsar';
import { purchasingDataSourceOptions } from '../data-source';
import { HealthModule } from './health/health.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { SupplierReviewsModule } from './supplier-reviews/supplier-reviews.module';
import { SupplierCatalogItemsModule } from './supplier-catalog-items/supplier-catalog-items.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { AutoDraftPoModule } from './auto-draft-po/auto-draft-po.module';
import { AuthModule } from './auth/auth.module';
import { PortalModule } from './portal/portal.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(purchasingDataSourceOptions),
    ThrottlerModule.forRoot([
      // Same defense-in-depth backstop as every other service — the
      // gateway applies the user-facing rate limit; this is for
      // direct/service-to-service access in local dev.
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    // Zero-trust: purchasing-service verifies the end-user JWT itself via
    // identity's JWKS endpoint rather than trusting the gateway (ADR-6) —
    // identical wiring to shipping/crm's app.module.ts. Supplier-portal auth
    // (Steps 11-12) is a separate `aud: 'supplier'` principal with its own
    // guard, not a modification of this staff-token chain.
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
    // The supplier-portal principal (Step 11-12): purchasing-service
    // verifies supplier tokens against its *own* JWKS (self-referential —
    // `PURCHASING_JWKS_URI` points back at this same service), never
    // identity's or crm's. Exports `SupplierJwtGuard`, applied per-route via
    // `@SupplierAuth()` on the portal controllers (Step 12), never a global
    // APP_GUARD — the staff-token chain below stays untouched.
    SupplierAuthSharedModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        jwksUri: config.get<string>(
          'PURCHASING_JWKS_URI',
          'http://localhost:3010/api/auth/jwks',
        ),
        issuer: config.get<string>('PURCHASING_JWT_ISSUER', 'ecomiq-purchasing-supplier'),
      }),
    }),
    // Registers PulsarProducerService + the outbox relay poller for
    // purchasing-service's own domain events (supplier/PO events). Event
    // *consumer* connections (inventory's stock_level topic for auto-draft
    // POs, Step 10) are wired separately in main.ts once they exist.
    PulsarModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        serviceUrl: config.get<string>('PULSAR_SERVICE_URL', 'pulsar://localhost:6650'),
        tenant: config.get<string>('PULSAR_TENANT', 'ecomiq'),
        namespace: config.get<string>('PURCHASING_PULSAR_NAMESPACE', 'purchasing'),
        authToken: config.get<string | undefined>('PULSAR_AUTH_TOKEN', undefined),
      }),
    }),
    HealthModule,
    // Supplier CRUD, status/feature/favorite toggles, `SUP-<n>` display ids.
    SuppliersModule,
    // Merchant-entered supplier reviews + in-transaction rating_avg/
    // rating_count rollup on the supplier row (same-DB, no event round-trip).
    SupplierReviewsModule,
    // Supplier product catalog lines (price range, min order qty, in-stock
    // toggle). Step 10's auto-draft PO consumer resolves a unit cost by
    // matching on this module's additive `variant_id` column.
    SupplierCatalogItemsModule,
    // PO CRUD + wizard + status machine (draft/sent/confirmed/
    // partially_received/received/canceled), PO-<n> display ids.
    PurchaseOrdersModule,
    // Consumes inventory-service's `inventory.reorder.triggered` (via
    // PulsarServer, connected in main.ts, not through this module) to
    // auto-draft a PO — the reverse direction of Step 9's cross-service
    // relationship.
    AutoDraftPoModule,
    // Supplier-portal auth core (Step 11): register/login/refresh/logout +
    // JWKS. Register-claims-by-email against an existing (admin-created)
    // supplier row — no self-serve supplier creation.
    AuthModule,
    // Supplier-portal endpoints (Step 12): own profile (contact fields
    // only), own catalog items, own POs + confirm — every route gated by
    // `SupplierJwtGuard` (`@SupplierAuth()`), never a URL-param-supplied id.
    PortalModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Must come after JwtAuthGuard in this array (guard order follows
    // provider order): asserts `req.user.storeId` exists and stamps
    // `req.storeId` — same ordering rule as every other service.
    { provide: APP_GUARD, useClass: StoreContextGuard },
    // Not a global APP_GUARD — applied per-controller via
    // `@UseGuards(PermissionsGuard)` + `@RequirePermissions('purchasing:...')`.
    PermissionsGuard,
  ],
})
export class AppModule {}
