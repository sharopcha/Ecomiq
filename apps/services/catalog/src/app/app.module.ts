import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthSharedModule, JwtAuthGuard, PermissionsGuard, StoreContextGuard } from '@temp-nx/auth';
import { PulsarModule } from '@temp-nx/pulsar';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { catalogDataSourceOptions } from '../data-source';
import { HealthModule } from './health/health.module';
import { VendorsModule } from './vendors/vendors.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductTypesModule } from './product-types/product-types.module';
import { ChannelsModule } from './channels/channels.module';
import { TagsModule } from './tags/tags.module';
import { ProductsModule } from './products/products.module';
import { ProductOptionsModule } from './product-options/product-options.module';
import { ProductVariantsModule } from './product-variants/product-variants.module';
import { ProductImagesModule } from './product-images/product-images.module';
import { BundlesModule } from './bundles/bundles.module';
import { LicenseKeysModule } from './license-keys/license-keys.module';
import { CatalogSyncModule } from './catalog-sync/catalog-sync.module';
import { StorefrontModule } from './storefront/storefront.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(catalogDataSourceOptions),
    ThrottlerModule.forRoot([
      // Same defense-in-depth backstop as identity — the gateway applies
      // the user-facing rate limit; this is for direct/service-to-service
      // access in local dev.
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    // Zero-trust: catalog verifies the end-user JWT itself via identity's
    // JWKS endpoint rather than trusting the gateway (ADR-6) — same wiring
    // as api-gateway's app.module.ts, since catalog is a pure resource
    // server here, not an issuer (that's identity's job).
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
    // Registers PulsarProducerService + the outbox relay poller. Domain
    // services write outbox rows inside their own transactions
    // (recordOutboxEvent from @temp-nx/pulsar); this module is what
    // actually drains that table to Pulsar in the background.
    PulsarModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        serviceUrl: config.get<string>('PULSAR_SERVICE_URL', 'pulsar://localhost:6650'),
        tenant: config.get<string>('PULSAR_TENANT', 'ecomiq'),
        // Service-prefixed key, not a generic PULSAR_NAMESPACE — see the
        // matching comment in inventory-service's app.module.ts for why
        // (each service needs its own namespace var so they don't collide
        // when several run side-by-side via `nx serve` against one shared
        // root .env).
        namespace: config.get<string>('CATALOG_PULSAR_NAMESPACE', 'catalog'),
        // See PulsarModuleOptions.authToken's doc comment; undefined in dev
        // (unset env var) means no change from today's unauthenticated
        // connection.
        authToken: config.get<string | undefined>('PULSAR_AUTH_TOKEN', undefined),
      }),
    }),
    HealthModule,
    // Taxonomy: simple CRUD, establishes the module pattern the rest of
    // catalog (products/variants/images) follows.
    VendorsModule,
    CategoriesModule,
    ProductTypesModule,
    ChannelsModule,
    TagsModule,
    // Product core CRUD.
    ProductsModule,
    // Variant system (options/values/variants, nested under a product).
    ProductOptionsModule,
    ProductVariantsModule,
    // Product images (ordering/attach/remove; file_id is a plain reference
    // until a real media service/file_asset table exists).
    ProductImagesModule,
    // Bundles (span variants across products, own aggregate/topic) and
    // license keys (children of a product, ride the product aggregate).
    BundlesModule,
    LicenseKeysModule,
    // crm-service's review.events consumer -> product.rating_avg/rating_count.
    CatalogSyncModule,
    // Storefront API (public, unauthenticated product queries)
    StorefrontModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Must come after JwtAuthGuard in this array
    // (guard order follows provider order): asserts `req.user.storeId`
    // exists and stamps `req.storeId`, bypassing @Public() routes and
    // non-HTTP contexts (CatalogSyncController's Pulsar handlers) itself —
    // see the guard's own doc comment for why both bypasses are needed.
    { provide: APP_GUARD, useClass: StoreContextGuard },
    // Not a global APP_GUARD — applied per-controller via
    // `@UseGuards(PermissionsGuard)` + `@RequirePermissions('products:read')`,
    // same pattern as api-gateway, since permission requirements differ
    // per endpoint rather than being blanket-applied.
    PermissionsGuard,
  ],
})
export class AppModule {}
