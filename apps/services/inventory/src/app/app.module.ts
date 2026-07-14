import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthSharedModule, JwtAuthGuard, PermissionsGuard, StoreContextGuard } from '@temp-nx/auth';
import { PulsarModule } from '@temp-nx/pulsar';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { inventoryDataSourceOptions } from '../data-source';
import { HealthModule } from './health/health.module';
import { LocationsModule } from './locations/locations.module';
import { CatalogSyncModule } from './catalog-sync/catalog-sync.module';
import { StockLevelsModule } from './stock-levels/stock-levels.module';
import { StockMovementsModule } from './stock-movements/stock-movements.module';
import { StockAuditsModule } from './stock-audits/stock-audits.module';
import { StockAlertsModule } from './stock-alerts/stock-alerts.module';
import { ReservationsModule } from './reservations/reservations.module';
import { ReorderRulesModule } from './reorder-rules/reorder-rules.module';
import { OrderSyncModule } from './order-sync/order-sync.module';
import { PurchasingSyncModule } from './purchasing-sync/purchasing-sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(inventoryDataSourceOptions),
    ThrottlerModule.forRoot([
      // Same defense-in-depth backstop as identity/catalog — the gateway
      // applies the user-facing rate limit; this is for direct/service-to-service
      // access in local dev.
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    // Zero-trust: inventory verifies the end-user JWT itself via identity's
    // JWKS endpoint rather than trusting the gateway (ADR-6) — identical
    // wiring to catalog's app.module.ts.
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
    // inventory's own domain events (inventory.stock.*, inventory.reservation.*,
    // inventory.reorder.triggered).
    //
    // Namespace uses a service-prefixed env var (INVENTORY_PULSAR_NAMESPACE),
    // *not* the generic PULSAR_NAMESPACE catalog-service reads — catalog's
    // .env sets PULSAR_NAMESPACE=catalog globally, and if inventory read the
    // same key it would publish its own events onto catalog's namespace
    // whenever both services run side-by-side via `nx serve` on the host
    // (docker-compose sidesteps this by setting the env var per-container,
    // but the shared root .env used for local dev does not). Same reasoning
    // as DB_HOST/DB_NAME already being prefixed per service.
    PulsarModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        serviceUrl: config.get<string>('PULSAR_SERVICE_URL', 'pulsar://localhost:6650'),
        tenant: config.get<string>('PULSAR_TENANT', 'ecomiq'),
        namespace: config.get<string>('INVENTORY_PULSAR_NAMESPACE', 'inventory'),
        // See PulsarModuleOptions.authToken's doc comment; undefined in dev
        // (unset env var) means no change from today's unauthenticated
        // connection.
        authToken: config.get<string | undefined>('PULSAR_AUTH_TOKEN', undefined),
      }),
    }),
    HealthModule,
    // Warehouses: plain tenant-scoped CRUD, no outbox events (see
    // locations.service.ts doc comment for why). Establishes the module
    // pattern the rest of this service follows (CatalogVariantSnapshotModule,
    // StockLevelsModule, StockMovementsModule, StockAuditModule,
    // StockAlertsModule, ReservationsModule, ReorderRulesModule).
    LocationsModule,
    // Consumes catalog-service's product.events (via PulsarServer,
    // connected as a hybrid microservice in main.ts, not through this
    // module) into the CatalogProductSnapshot/CatalogVariantSnapshot
    // read-model tables. See catalog-sync.controller.ts's doc comment for
    // why it's @Public()/@SkipThrottle() despite the guards above being
    // global.
    CatalogSyncModule,
    // The variant x location cell + the Inventory list read API.
    // on_hand/reserved are only ever mutated by the stock_movement
    // ledger, never through this module's own create/update endpoints.
    StockLevelsModule,
    // The append-only ledger and the *only* place on_hand/reserved
    // are mutated (StockMovementsService.record()), publishing
    // inventory.stock.adjusted via the outbox. Exports the service so
    // later modules can call into it instead of touching StockLevel directly.
    StockMovementsModule,
    // The Audit Stock modal + "Stock adjustment history." Only
    // caller of StockMovementsService.record() with kind=adjustment; a
    // `value`-type audit never touches StockLevel at all (see
    // stock-audit.entity.ts's doc comment).
    StockAuditsModule,
    // The "Create Stock Alert" subscription rows (plain CRUD,
    // like Locations). The actual threshold-crossing detection and
    // inventory.stock.low publish happen inside StockMovementsService
    // (see its checkAndPublishLowStockAlerts), not in this module — it just
    // manages which alerts exist.
    StockAlertsModule,
    // "Reserve Item": 24h holds against a stock_level's `reserved`
    // quantity, via the same StockMovementsService.record() primitive
    // (kind=reservation/release), plus the automatic 24h timeout release
    // on top of explicit create/release.
    ReservationsModule,
    // "Set Automatic Reorder" rule rows (plain CRUD, like
    // StockAlertsModule). The actual trigger-level crossing detection and
    // inventory.reorder.triggered publish happen inside
    // StockMovementsService (see its checkAndTriggerReorders) — this module
    // just manages which rules exist.
    ReorderRulesModule,
    // An additive consumer of order-service's own
    // `orders.order.placed`/`.canceled` events (via PulsarServer, connected
    // in main.ts, not through this module — same shape as CatalogSyncModule
    // above). Commits/releases reservations through ReservationsService's
    // existing public methods.
    OrderSyncModule,
    // An additive consumer of purchasing-service's own
    // `purchasing.po.received` events (via PulsarServer, connected in
    // main.ts, not through this module — same shape as
    // CatalogSyncModule/OrderSyncModule above). Gives
    // StockMovementKind.PurchaseReceipt its first real producer.
    PurchasingSyncModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Must come after JwtAuthGuard in this array
    // (guard order follows provider order): asserts `req.user.storeId`
    // exists and stamps `req.storeId`, bypassing @Public() routes and
    // non-HTTP contexts (CatalogSyncController's Pulsar handlers,
    // ReservationGrpcController's gRPC calls) itself — see the guard's own
    // doc comment for why both bypasses are needed.
    { provide: APP_GUARD, useClass: StoreContextGuard },
    // Not a global APP_GUARD — applied per-controller via
    // `@UseGuards(PermissionsGuard)` + `@RequirePermissions('inventory:read')`,
    // same pattern as catalog/api-gateway.
    PermissionsGuard,
  ],
})
export class AppModule {}
