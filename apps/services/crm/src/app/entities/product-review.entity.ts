import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

export enum ReviewStatus {
  Pending = 'pending',
  Published = 'published',
  Archived = 'archived',
}

/**
 * `product_id`/`order_id` are plain opaque text columns, not FKs — product
 * lives in catalog_db and order lives in order_db (ADR-2, database-per-
 * service). `customer_id` is a same-DB FK (customer lives in crm_db too).
 *
 * No `deleted_at` — the data model's general "soft delete only where UI has
 * Archive" convention note would suggest one, but the concrete
 * `product_review` DDL has no such column, and `status` already carries an
 * `archived` value serving exactly that purpose (same status-flip pattern
 * as `Customer.archive()`, not `Product`'s real `TenantScopedSoftDeletableEntity`
 * soft-delete — adding both would just be redundant bookkeeping for the
 * same fact).
 *
 * `ai_sentiment` stays null — ai-service is a stub; the column exists so ai
 * can attach later without a crm-service change.
 */
@Entity('product_review')
export class ProductReview extends TenantScopedEntity {
  @Index()
  @Column({ type: 'text', name: 'product_id', nullable: true })
  productId?: string | null;

  @Index()
  @Column({ type: 'text', name: 'customer_id', nullable: true })
  customerId?: string | null;

  @Column({ type: 'text', name: 'order_id', nullable: true })
  orderId?: string | null;

  @Column({ type: 'int' })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  title?: string | null;

  @Column({ type: 'text', nullable: true })
  body?: string | null;

  @Column({ type: 'text', array: true, name: 'media_file_ids', nullable: true })
  mediaFileIds?: string[] | null;

  @Column({ type: 'text', default: ReviewStatus.Pending })
  status!: ReviewStatus;

  @Column({ type: 'jsonb', name: 'ai_sentiment', nullable: true })
  aiSentiment?: Record<string, unknown> | null;
}
