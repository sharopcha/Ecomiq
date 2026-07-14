import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { OutboxMessage } from '@temp-nx/typeorm';
import { Location } from './app/entities/location.entity';
import { CatalogProductSnapshot } from './app/entities/catalog-product-snapshot.entity';
import { CatalogVariantSnapshot } from './app/entities/catalog-variant-snapshot.entity';
import { StockLevel } from './app/entities/stock-level.entity';
import { StockMovement } from './app/entities/stock-movement.entity';
import { StockAudit } from './app/entities/stock-audit.entity';
import { StockAlert } from './app/entities/stock-alert.entity';
import { Reservation } from './app/entities/reservation.entity';
import { ReorderRule } from './app/entities/reorder-rule.entity';

loadEnv();

/**
 * Single source of truth for TypeORM config, used both by NestJS
 * (TypeOrmModule.forRoot in app.module.ts) and by the TypeORM CLI for
 * migrations — mirrors apps/services/catalog/src/data-source.ts:
 *
 *   npx typeorm-ts-node-commonjs migration:run -d apps/services/inventory/src/data-source.ts
 *   npx typeorm-ts-node-commonjs migration:generate -d apps/services/inventory/src/data-source.ts apps/services/inventory/src/app/migrations/<Name>
 *
 * `entities` starts with `OutboxMessage` + `Location` +
 * `CatalogProductSnapshot`/`CatalogVariantSnapshot` + `StockLevel` +
 * `StockMovement` + `StockAudit` + `StockAlert` + `Reservation` +
 * `ReorderRule`. This is the full entity list for this service.
 * Explicit list rather than a glob, same reasoning as catalog's:
 * typo-safety over convenience.
 */
const isProduction = process.env.NODE_ENV === 'production';

export const inventoryDataSourceOptions = {
  type: 'postgres' as const,
  host: process.env.INVENTORY_DB_HOST ?? 'localhost',
  port: Number(process.env.INVENTORY_DB_PORT ?? 5432),
  username: process.env.INVENTORY_DB_USER ?? 'ecomiq',
  password: process.env.INVENTORY_DB_PASSWORD ?? 'ecomiq',
  database: process.env.INVENTORY_DB_NAME ?? 'inventory_db',
  entities: [
    OutboxMessage,
    Location,
    CatalogProductSnapshot,
    CatalogVariantSnapshot,
    StockLevel,
    StockMovement,
    StockAudit,
    StockAlert,
    Reservation,
    ReorderRule,
  ],
  migrations: [__dirname + '/app/migrations/*.{ts,js}'],
  // Local dev only (same call as identity/catalog): auto-sync schema from
  // entities on every boot. Hard-gated off in production.
  synchronize: !isProduction,
  namingStrategy: undefined, // columns are explicitly snake_case via @Column({ name })
};

export default new DataSource(inventoryDataSourceOptions);
