import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { OutboxMessage } from '@temp-nx/typeorm';
import { Customer } from './app/entities/customer.entity';
import { CustomerAddress } from './app/entities/customer-address.entity';
import { StoreSequence } from './app/entities/store-sequence.entity';
import { ActivityLog } from './app/entities/activity-log.entity';
import { ProcessedEvent } from './app/entities/processed-event.entity';
import { ProductReview } from './app/entities/product-review.entity';
import { ReviewRequest } from './app/entities/review-request.entity';
import { Referral } from './app/entities/referral.entity';
import { WishlistItem } from './app/entities/wishlist-item.entity';
import { LoyaltyAccount } from './app/entities/loyalty-account.entity';
import { LoyaltyTxn } from './app/entities/loyalty-txn.entity';
import { Segment } from './app/entities/segment.entity';
import { SegmentMember } from './app/entities/segment-member.entity';

loadEnv();

/**
 * Single source of truth for TypeORM config, used both by NestJS
 * (TypeOrmModule.forRoot in app.module.ts) and by the TypeORM CLI for
 * migrations — mirrors apps/services/shipping/src/data-source.ts:
 *
 *   npx typeorm-ts-node-commonjs migration:run -d apps/services/crm/src/data-source.ts
 *   npx typeorm-ts-node-commonjs migration:generate -d apps/services/crm/src/data-source.ts apps/services/crm/src/app/migrations/<Name>
 *
 * `entities` starts with `OutboxMessage`; every domain entity (customer,
 * customer_address, product_review, ...) gets appended here and only here as
 * later steps land — repo rule: every new entity must be added to this
 * array, not just a module's TypeOrmModule.forFeature.
 *
 * `synchronize` is hard-`false` unconditionally, same precedent as
 * notification/shipping — every schema change goes through a hand-written
 * migration from day one.
 */
export const crmDataSourceOptions = {
  type: 'postgres' as const,
  host: process.env.CRM_DB_HOST ?? 'localhost',
  port: Number(process.env.CRM_DB_PORT ?? 5432),
  username: process.env.CRM_DB_USER ?? 'ecomiq',
  password: process.env.CRM_DB_PASSWORD ?? 'ecomiq',
  database: process.env.CRM_DB_NAME ?? 'crm_db',
  entities: [
    OutboxMessage,
    Customer,
    CustomerAddress,
    StoreSequence,
    ActivityLog,
    ProcessedEvent,
    ProductReview,
    ReviewRequest,
    Referral,
    WishlistItem,
    LoyaltyAccount,
    LoyaltyTxn,
    Segment,
    SegmentMember,
  ],
  migrations: [__dirname + '/app/migrations/*.{ts,js}'],
  synchronize: false,
  namingStrategy: undefined, // columns are explicitly snake_case via @Column({ name })
};

export default new DataSource(crmDataSourceOptions);
