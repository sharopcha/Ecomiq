import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { OutboxMessage } from '@temp-nx/typeorm';
import { Supplier } from './app/entities/supplier.entity';
import { StoreSequence } from './app/entities/store-sequence.entity';
import { ActivityLog } from './app/entities/activity-log.entity';
import { SupplierReview } from './app/entities/supplier-review.entity';
import { SupplierCatalogItem } from './app/entities/supplier-catalog-item.entity';
import { PurchaseOrder } from './app/entities/purchase-order.entity';
import { PurchaseOrderLine } from './app/entities/purchase-order-line.entity';

loadEnv();

/**
 * Single source of truth for TypeORM config, used both by NestJS
 * (TypeOrmModule.forRoot in app.module.ts) and by the TypeORM CLI for
 * migrations — mirrors apps/services/shipping/src/data-source.ts:
 *
 *   npx typeorm-ts-node-commonjs migration:run -d apps/services/purchasing/src/data-source.ts
 *   npx typeorm-ts-node-commonjs migration:generate -d apps/services/purchasing/src/data-source.ts apps/services/purchasing/src/app/migrations/<Name>
 *
 * `entities` starts with `OutboxMessage`; every domain entity (supplier,
 * supplier_review, supplier_catalog_item, purchase_order, ...) gets appended
 * here and only here as later steps land — repo rule: every new entity must
 * be added to this array, not just a module's TypeOrmModule.forFeature.
 *
 * `synchronize` is hard-`false` unconditionally (shipping/notification's
 * precedent) — every schema change goes through a hand-written migration
 * from day one.
 */
export const purchasingDataSourceOptions = {
  type: 'postgres' as const,
  host: process.env.PURCHASING_DB_HOST ?? 'localhost',
  port: Number(process.env.PURCHASING_DB_PORT ?? 5432),
  username: process.env.PURCHASING_DB_USER ?? 'ecomiq',
  password: process.env.PURCHASING_DB_PASSWORD ?? 'ecomiq',
  database: process.env.PURCHASING_DB_NAME ?? 'purchasing_db',
  entities: [
    OutboxMessage,
    Supplier,
    StoreSequence,
    ActivityLog,
    SupplierReview,
    SupplierCatalogItem,
    PurchaseOrder,
    PurchaseOrderLine,
  ],
  migrations: [__dirname + '/app/migrations/*.{ts,js}'],
  synchronize: false,
  namingStrategy: undefined, // columns are explicitly snake_case via @Column({ name })
};

export default new DataSource(purchasingDataSourceOptions);
