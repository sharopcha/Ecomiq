import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { OutboxMessage } from '@temp-nx/typeorm';
import { Order } from './app/entities/order.entity';
import { OrderLine } from './app/entities/order-line.entity';
import { OrderTag } from './app/entities/order-tag.entity';
import { Invoice } from './app/entities/invoice.entity';
import { OrderComment } from './app/entities/order-comment.entity';
import { ActivityLog } from './app/entities/activity-log.entity';
import { ReturnRequest } from './app/entities/return-request.entity';
import { ReturnLine } from './app/entities/return-line.entity';
import { ReturnProof } from './app/entities/return-proof.entity';
import { Refund } from './app/entities/refund.entity';
import { StoreSequence } from './app/entities/store-sequence.entity';
import { SagaState } from './app/entities/saga-state.entity';
import { FulfillmentRollup } from './app/entities/fulfillment-rollup.entity';

loadEnv();

/**
 * Single source of truth for TypeORM config, used both by NestJS
 * (TypeOrmModule.forRoot in app.module.ts) and by the TypeORM CLI for
 * migrations — mirrors apps/services/inventory/src/data-source.ts:
 *
 *   npx typeorm-ts-node-commonjs migration:run -d apps/services/order/src/data-source.ts
 *   npx typeorm-ts-node-commonjs migration:generate -d apps/services/order/src/data-source.ts apps/services/order/src/app/migrations/<Name>
 *
 * `entities` starts with `OutboxMessage`. Domain entities
 * (order/order-line/return-request/refund/saga-state/store-sequence/…)
 * get appended here and only here — repo rule: every new entity
 * must be added to this array, not just a module's TypeOrmModule.forFeature.
 * Explicit list rather than a glob, same reasoning as catalog/inventory's:
 * typo-safety over convenience.
 */
const isProduction = process.env.NODE_ENV === 'production';

export const orderDataSourceOptions = {
  type: 'postgres' as const,
  host: process.env.ORDER_DB_HOST ?? 'localhost',
  port: Number(process.env.ORDER_DB_PORT ?? 5432),
  username: process.env.ORDER_DB_USER ?? 'ecomiq',
  password: process.env.ORDER_DB_PASSWORD ?? 'ecomiq',
  database: process.env.ORDER_DB_NAME ?? 'order_db',
  entities: [
    OutboxMessage,
    Order,
    OrderLine,
    OrderTag,
    Invoice,
    OrderComment,
    ActivityLog,
    ReturnRequest,
    ReturnLine,
    ReturnProof,
    Refund,
    StoreSequence,
    SagaState,
    FulfillmentRollup,
  ],
  migrations: [__dirname + '/app/migrations/*.{ts,js}'],
  // Local dev only (same call as identity/catalog/inventory): auto-sync
  // schema from entities on every boot. Hard-gated off in production —
  // repo rule: synchronize:true never in migrations/prod.
  synchronize: !isProduction,
  namingStrategy: undefined, // columns are explicitly snake_case via @Column({ name })
};

export default new DataSource(orderDataSourceOptions);
