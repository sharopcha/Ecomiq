import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { OutboxMessage } from '@temp-nx/typeorm';
import { Vendor } from './app/entities/vendor.entity';
import { Category } from './app/entities/category.entity';
import { ProductType } from './app/entities/product-type.entity';
import { Channel } from './app/entities/channel.entity';
import { Tag } from './app/entities/tag.entity';
import { Product } from './app/entities/product.entity';
import { ProductOption } from './app/entities/product-option.entity';
import { ProductOptionValue } from './app/entities/product-option-value.entity';
import { ProductVariant } from './app/entities/product-variant.entity';
import { ProductImage } from './app/entities/product-image.entity';
import { Bundle } from './app/entities/bundle.entity';
import { BundleItem } from './app/entities/bundle-item.entity';
import { LicenseKey } from './app/entities/license-key.entity';
import { ProcessedEvent } from './app/entities/processed-event.entity';

loadEnv();

/**
 * Single source of truth for TypeORM config, used both by NestJS
 * (TypeOrmModule.forRoot in app.module.ts) and by the TypeORM CLI for
 * migrations — mirrors apps/services/identity/src/data-source.ts:
 *
 *   npx typeorm-ts-node-commonjs migration:run -d apps/services/catalog/src/data-source.ts
 *   npx typeorm-ts-node-commonjs migration:generate -d apps/services/catalog/src/data-source.ts apps/services/catalog/src/app/migrations/<Name>
 *
 * `entities` starts with `OutboxMessage` + the taxonomy entities, with
 * product/product_variant/product_image/etc. appended as each was built.
 * Kept as an explicit list rather than a glob, same reasoning as identity's:
 * typo-safety over convenience.
 *
 * `Bundle`/`BundleItem`/`LicenseKey` were added here after they'd been
 * wired into bundles.module.ts / license-keys.module.ts via
 * `TypeOrmModule.forFeature` but never added to this list, so TypeORM had
 * no metadata for them at all: `synchronize` silently never created their
 * tables, and any query against them would have thrown
 * `EntityMetadataNotFoundError` at runtime. Caught while authoring the
 * initial migration (which is generated from this list) — fixing it here,
 * not just in the migration, so dev's `synchronize` and prod's migration
 * produce the same schema.
 */
const isProduction = process.env.NODE_ENV === 'production';

export const catalogDataSourceOptions = {
  type: 'postgres' as const,
  host: process.env.CATALOG_DB_HOST ?? 'localhost',
  port: Number(process.env.CATALOG_DB_PORT ?? 5432),
  username: process.env.CATALOG_DB_USER ?? 'ecomiq',
  password: process.env.CATALOG_DB_PASSWORD ?? 'ecomiq',
  database: process.env.CATALOG_DB_NAME ?? 'catalog_db',
  entities: [
    OutboxMessage,
    Vendor,
    Category,
    ProductType,
    Channel,
    Tag,
    Product,
    ProductOption,
    ProductOptionValue,
    ProductVariant,
    ProductImage,
    Bundle,
    BundleItem,
    LicenseKey,
    ProcessedEvent,
  ],
  migrations: [__dirname + '/app/migrations/*.{ts,js}'],
  // Local dev only (same call as identity, 2026-07-05): auto-sync schema
  // from entities on every boot. Hard-gated off in production.
  synchronize: !isProduction,
  namingStrategy: undefined, // columns are explicitly snake_case via @Column({ name })
};

export default new DataSource(catalogDataSourceOptions);
