import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { AppUser } from './app/entities/app-user.entity';
import { Store } from './app/entities/store.entity';
import { Membership } from './app/entities/membership.entity';
import { Invitation } from './app/entities/invitation.entity';
import { ApiKey } from './app/entities/api-key.entity';
import { ServiceAccount } from './app/entities/service-account.entity';

loadEnv();

/**
 * Single source of truth for TypeORM config, used both by NestJS
 * (TypeOrmModule.forRootAsync in app.module.ts) and by the TypeORM CLI for
 * migrations:
 *
 *   npx typeorm-ts-node-commonjs migration:run -d apps/services/identity/src/data-source.ts
 *   npx typeorm-ts-node-commonjs migration:generate -d apps/services/identity/src/data-source.ts apps/services/identity/src/app/migrations/<Name>
 */
const isProduction = process.env.NODE_ENV === 'production';

export const identityDataSourceOptions = {
  type: 'postgres' as const,
  host: process.env.IDENTITY_DB_HOST ?? 'localhost',
  port: Number(process.env.IDENTITY_DB_PORT ?? 5432),
  username: process.env.IDENTITY_DB_USER ?? 'ecomiq',
  password: process.env.IDENTITY_DB_PASSWORD ?? 'ecomiq',
  database: process.env.IDENTITY_DB_NAME ?? 'identity_db',
  entities: [AppUser, Store, Membership, Invitation, ApiKey, ServiceAccount],
  migrations: [__dirname + '/app/migrations/*.{ts,js}'],
  // Local dev only (user decision, 2026-07-05): auto-sync the schema from
  // entities on every boot, no `migration:run` needed while iterating.
  // Hard-gated off in production — ADR-4 still applies there. Migrations
  // (§ apps/services/identity/src/app/migrations) are kept around for when
  // this service gets a staging/prod environment; they're just not the only
  // path to a matching schema anymore while NODE_ENV isn't 'production'.
  synchronize: !isProduction,
  namingStrategy: undefined, // columns are explicitly snake_case via @Column({ name })
};

export default new DataSource(identityDataSourceOptions);
