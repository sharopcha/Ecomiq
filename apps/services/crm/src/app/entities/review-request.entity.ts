import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

/**
 * `order_id` is a plain opaque text column (order lives in order_db, ADR-2
 * — no cross-DB FK); `customer_id`/`review_id` are same-DB FKs (both
 * `customer` and `product_review` live in crm_db). `review_id` starts null
 * and is linked by `ReviewsService.create()` when a matching review (same
 * `order_id`+`customer_id`, no request already linked) is later created —
 * no reverse lookup exists in this repo to mirror, this is a fresh pattern.
 */
@Entity('review_request')
export class ReviewRequest extends TenantScopedEntity {
  @Column({ type: 'text', name: 'order_id' })
  orderId!: string;

  @Index()
  @Column({ type: 'text', name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'timestamptz', name: 'sent_at', nullable: true })
  sentAt?: Date | null;

  @Column({ type: 'text', name: 'review_id', nullable: true })
  reviewId?: string | null;
}
