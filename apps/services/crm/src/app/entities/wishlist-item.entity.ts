import { Column, Entity, Index, Unique } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

/**
 * `variant_id` is a plain opaque text column, not a FK — `product_variant`
 * lives in catalog_db (ADR-2, no cross-DB FK), same precedent as
 * `product_review.product_id`. `customer_id` is a same-DB FK. Unique on
 * `(customer_id, variant_id)` makes a duplicate add a no-op at the DB
 * level, not just an application-level check.
 */
@Entity('wishlist_item')
@Unique(['customerId', 'variantId'])
export class WishlistItem extends TenantScopedEntity {
  @Index()
  @Column({ type: 'text', name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'text', name: 'variant_id' })
  variantId!: string;
}
