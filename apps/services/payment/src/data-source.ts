import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { OutboxMessage } from '@temp-nx/typeorm';
import { Payment } from './app/entities/payment.entity';
import { RefundExecution } from './app/entities/refund-execution.entity';
import { WebhookInbox } from './app/entities/webhook-inbox.entity';

loadEnv();

/**
 * Single source of truth for TypeORM config, used both by NestJS
 * (TypeOrmModule.forRoot in app.module.ts) and by the TypeORM CLI for
 * migrations — mirrors apps/services/inventory/src/data-source.ts:
 *
 *   npx typeorm-ts-node-commonjs migration:run -d apps/services/payment/src/data-source.ts
 *   npx typeorm-ts-node-commonjs migration:generate -d apps/services/payment/src/data-source.ts apps/services/payment/src/app/migrations/<Name>
 *
 * `entities` starts with `OutboxMessage`. Domain entities
 * (payment/refund-execution/webhook-inbox) get appended here and
 * only here — repo rule: every new entity must be added to this array, not
 * just a module's TypeOrmModule.forFeature. Explicit list rather than a
 * glob, same reasoning as catalog/inventory's: typo-safety over convenience.
 */
const isProduction = process.env.NODE_ENV === 'production';

export const paymentDataSourceOptions = {
  type: 'postgres' as const,
  host: process.env.PAYMENT_DB_HOST ?? 'localhost',
  port: Number(process.env.PAYMENT_DB_PORT ?? 5432),
  username: process.env.PAYMENT_DB_USER ?? 'ecomiq',
  password: process.env.PAYMENT_DB_PASSWORD ?? 'ecomiq',
  database: process.env.PAYMENT_DB_NAME ?? 'payment_db',
  entities: [OutboxMessage, Payment, RefundExecution, WebhookInbox],
  migrations: [__dirname + '/app/migrations/*.{ts,js}'],
  // Local dev only (same call as identity/catalog/inventory): auto-sync
  // schema from entities on every boot. Hard-gated off in production —
  // repo rule: synchronize:true never in migrations/prod.
  synchronize: !isProduction,
  namingStrategy: undefined, // columns are explicitly snake_case via @Column({ name })
};

export default new DataSource(paymentDataSourceOptions);
