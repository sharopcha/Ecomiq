import { Column, Entity, Index } from 'typeorm';
import { MoneyTransformer, TenantScopedEntity } from '@temp-nx/typeorm';

/**
 * Supplier's product catalog line (price range, minimum order, variants,
 * In-Stock toggle). `image_file_id` is an opaque nullable column — a
 * media-service stub, same precedent as shipping's `label_file_id` (out of
 * scope: media attachments). `linked_product_id` is an opaque, manually-set
 * text column, not a real FK — catalog integration/import is future work,
 * out of scope for this plan. `variant_id` is additive: nullable, merchant-
 * set, no cross-DB FK either — it exists purely so Step 10's auto-draft PO
 * consumer can resolve a unit cost by matching the reorder-triggered
 * payload's `variantId` against a supplier_catalog_item row.
 */
@Entity('supplier_catalog_item')
export class SupplierCatalogItem extends TenantScopedEntity {
  @Index()
  @Column({ type: 'text', name: 'supplier_id' })
  supplierId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  sku?: string | null;

  @Column({
    type: 'bigint',
    name: 'price_min_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  priceMinMinor?: number | null;

  @Column({
    type: 'bigint',
    name: 'price_max_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  priceMaxMinor?: number | null;

  @Column({ type: 'int', name: 'min_order_qty', nullable: true })
  minOrderQty?: number | null;

  @Column({ type: 'boolean', name: 'in_stock', default: true })
  inStock!: boolean;

  @Column({ type: 'int', name: 'variant_count', nullable: true })
  variantCount?: number | null;

  @Column({ type: 'text', name: 'image_file_id', nullable: true })
  imageFileId?: string | null;

  @Column({ type: 'text', name: 'linked_product_id', nullable: true })
  linkedProductId?: string | null;

  @Index()
  @Column({ type: 'text', name: 'variant_id', nullable: true })
  variantId?: string | null;
}
