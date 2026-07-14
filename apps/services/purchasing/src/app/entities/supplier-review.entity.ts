import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';

/**
 * Merchant-entered review of a supplier — `author_name` is free text (no
 * customer FK here, unlike crm's `product_review.customer_id`; these are
 * typed in by staff, not submitted by a registered principal). No
 * `updated_at`/soft-delete in the data model — just `created_at`, deleted
 * for real on `DELETE /suppliers/:supplierId/reviews/:id`.
 */
@Entity('supplier_review')
export class SupplierReview extends BaseEntity {
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @Index()
  @Column({ type: 'text', name: 'supplier_id' })
  supplierId!: string;

  @Column({ type: 'text', name: 'author_name', nullable: true })
  authorName?: string | null;

  @Column({ type: 'int' })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  title?: string | null;

  @Column({ type: 'text', nullable: true })
  body?: string | null;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
