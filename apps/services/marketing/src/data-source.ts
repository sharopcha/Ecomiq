import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { OutboxMessage } from '@temp-nx/typeorm';
import { Discount } from './app/entities/discount.entity';
import { DiscountUsage } from './app/entities/discount-usage.entity';
import { Campaign } from './app/entities/campaign.entity';
import { CampaignSend } from './app/entities/campaign-send.entity';
import { Ad } from './app/entities/ad.entity';
import { Popup } from './app/entities/popup.entity';
import { Form } from './app/entities/form.entity';
import { FormSubmission } from './app/entities/form-submission.entity';
import { SegmentSnapshot } from './app/entities/segment-snapshot.entity';

loadEnv();

/**
 * Single source of truth for TypeORM config, used both by NestJS
 * (TypeOrmModule.forRoot in app.module.ts) and by the TypeORM CLI for
 * migrations — mirrors apps/services/inventory/src/data-source.ts:
 *
 *   npx typeorm-ts-node-commonjs migration:run -d apps/services/marketing/src/data-source.ts
 *   npx typeorm-ts-node-commonjs migration:generate -d apps/services/marketing/src/data-source.ts apps/services/marketing/src/app/migrations/<Name>
 *
 * `entities` starts with `OutboxMessage`. Domain entities
 * (discount/discount-usage, campaign/campaign-send,
 * ad/popup/form/form-submission) get appended here and only here — repo
 * rule: every new entity must be added to this array, not just a module's
 * TypeOrmModule.forFeature. Explicit list rather than a glob, same
 * reasoning as catalog/inventory's: typo-safety over convenience.
 */
const isProduction = process.env.NODE_ENV === 'production';

export const marketingDataSourceOptions = {
  type: 'postgres' as const,
  host: process.env.MARKETING_DB_HOST ?? 'localhost',
  port: Number(process.env.MARKETING_DB_PORT ?? 5432),
  username: process.env.MARKETING_DB_USER ?? 'ecomiq',
  password: process.env.MARKETING_DB_PASSWORD ?? 'ecomiq',
  database: process.env.MARKETING_DB_NAME ?? 'marketing_db',
  entities: [
    OutboxMessage,
    Discount,
    DiscountUsage,
    Campaign,
    CampaignSend,
    Ad,
    Popup,
    Form,
    FormSubmission,
    SegmentSnapshot,
  ],
  migrations: [__dirname + '/app/migrations/*.{ts,js}'],
  // Local dev only (same call as identity/catalog/inventory): auto-sync
  // schema from entities on every boot. Hard-gated off in production —
  // repo rule: synchronize:true never in migrations/prod.
  synchronize: !isProduction,
  namingStrategy: undefined, // columns are explicitly snake_case via @Column({ name })
};

export default new DataSource(marketingDataSourceOptions);
