import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { OutboxMessage } from '@temp-nx/typeorm';
import { FileFolder } from './app/entities/file-folder.entity';
import { ActivityLog } from './app/entities/activity-log.entity';
import { FileAsset } from './app/entities/file-asset.entity';

loadEnv();

/**
 * Single source of truth for TypeORM config, used both by NestJS
 * (TypeOrmModule.forRoot in app.module.ts) and by the TypeORM CLI for
 * migrations — mirrors apps/services/purchasing/src/data-source.ts:
 *
 *   npx typeorm-ts-node-commonjs migration:run -d apps/services/media/src/data-source.ts
 *   npx typeorm-ts-node-commonjs migration:generate -d apps/services/media/src/data-source.ts apps/services/media/src/app/migrations/<Name>
 *
 * `entities` starts with `OutboxMessage`; `file_folder`/`file_asset` get
 * appended here and only here as Phase 1 lands — repo rule: every new
 * entity must be added to this array, not just a module's
 * TypeOrmModule.forFeature.
 *
 * `synchronize` is hard-`false` unconditionally (shipping/notification/
 * purchasing's precedent) — every schema change goes through a
 * hand-written migration from day one.
 */
export const mediaDataSourceOptions = {
  type: 'postgres' as const,
  host: process.env.MEDIA_DB_HOST ?? 'localhost',
  port: Number(process.env.MEDIA_DB_PORT ?? 5432),
  username: process.env.MEDIA_DB_USER ?? 'ecomiq',
  password: process.env.MEDIA_DB_PASSWORD ?? 'ecomiq',
  database: process.env.MEDIA_DB_NAME ?? 'media_db',
  entities: [OutboxMessage, FileFolder, ActivityLog, FileAsset],
  migrations: [__dirname + '/app/migrations/*.{ts,js}'],
  synchronize: false,
  namingStrategy: undefined, // columns are explicitly snake_case via @Column({ name })
};

export default new DataSource(mediaDataSourceOptions);
