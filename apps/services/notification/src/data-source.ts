import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { OutboxMessage } from '@temp-nx/typeorm';
import { EmailTemplate } from './app/entities/email-template.entity';
import { Notification } from './app/entities/notification.entity';
import { SendLog } from './app/entities/send-log.entity';

loadEnv();

/**
 * Single source of truth for TypeORM config, used both by NestJS
 * (TypeOrmModule.forRoot in app.module.ts) and by the TypeORM CLI for
 * migrations — mirrors apps/services/payment/src/data-source.ts:
 *
 *   npx typeorm-ts-node-commonjs migration:run -d apps/services/notification/src/data-source.ts
 *   npx typeorm-ts-node-commonjs migration:generate -d apps/services/notification/src/data-source.ts apps/services/notification/src/app/migrations/<Name>
 *
 * `entities` starts with `OutboxMessage`; every domain entity gets appended
 * here and only here — repo rule: every new entity must be added to this
 * array, not just a module's TypeOrmModule.forFeature.
 *
 * Unlike catalog/inventory/payment, `synchronize` is hard-`false`
 * unconditionally rather than `!isProduction` — notification-service is
 * born after the migration-vs-synchronize diff procedure was already
 * proven out on five other services, so there's no reason to let it start
 * on the auto-sync convenience path even in dev. Every schema change here
 * goes through a hand-written migration from day one.
 */
export const notificationDataSourceOptions = {
  type: 'postgres' as const,
  host: process.env.NOTIFICATION_DB_HOST ?? 'localhost',
  port: Number(process.env.NOTIFICATION_DB_PORT ?? 5432),
  username: process.env.NOTIFICATION_DB_USER ?? 'ecomiq',
  password: process.env.NOTIFICATION_DB_PASSWORD ?? 'ecomiq',
  database: process.env.NOTIFICATION_DB_NAME ?? 'notification_db',
  entities: [OutboxMessage, EmailTemplate, Notification, SendLog],
  migrations: [__dirname + '/app/migrations/*.{ts,js}'],
  synchronize: false,
  namingStrategy: undefined, // columns are explicitly snake_case via @Column({ name })
};

export default new DataSource(notificationDataSourceOptions);
