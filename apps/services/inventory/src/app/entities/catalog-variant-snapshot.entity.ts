import { Column, Entity, Index } from 'typeorm';
import { MoneyTransformer, TenantScopedEntity } from '@temp-nx/typeorm';

/**
 * Local read-model mirror of a catalog-service `product_variant` row — see
 * CatalogProductSnapshot's doc comment for the full event-carried-state-transfer
 * rationale; this is the same idea one level down. `id` is catalog's own
 * `product_variant.id`. `stock_level.variant_id` points at this
 * table's id, not at catalog's `product_variant` directly.
 *
 * `productId` is a plain column, not a TypeORM `@ManyToOne`/`@JoinColumn` —
 * deliberately, unlike catalog's own entities (which do use real relations
 * for their in-service FKs). A hard DB-level FK constraint here would fight
 * with `ensureProductPlaceholder` in catalog-sync.service.ts (a variant
 * event can legitimately arrive referencing a product this consumer hasn't
 * recorded yet), and StockLevelsService's queries can join on it via query
 * builder (`.innerJoin(CatalogProductSnapshot, 'p', 'p.id = variant.product_id')`)
 * just as easily as through a mapped relation. Simpler and avoids relying on
 * scalar-column + relation dual-mapping on the same DB column, which this
 * codebase's other entities don't do either (see product-option.entity.ts,
 * product-image.entity.ts — relation-only, no parallel scalar id field).
 *
 * Unlike catalog's `product_variant` table (which is hard-deleted — see
 * `CatalogEventType.VariantDeleted` / `ProductVariantsService.remove()`,
 * `manager.remove(variant)`, no soft-delete there), this snapshot keeps a
 * `deletedAt` marker instead of actually removing the row on
 * `catalog.variant.deleted`. Deliberate divergence: inventory-service's own
 * `stock_level`/`stock_movement`/`reservation` rows (Steps 4+) may still
 * reference a variant that's since been deleted in catalog (historical
 * stock movements, an order line from months ago, etc.), and a hard delete
 * here would either dangle those references or require ON DELETE CASCADE
 * that destroys inventory history nobody asked to lose. Normal queries
 * filter `deletedAt IS NULL`. (inventory-service's own
 * `stock_level`/`stock_movement`/`reservation` rows may still reference a
 * variant that's since been deleted in catalog.)
 */
@Entity('catalog_variant_snapshot')
export class CatalogVariantSnapshot extends TenantScopedEntity {
  @Index()
  @Column({ type: 'text', name: 'product_id' })
  productId!: string;

  @Column({ type: 'text' })
  sku!: string;

  @Column({
    type: 'bigint',
    name: 'price_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  priceMinor?: number | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', name: 'is_default', default: false })
  isDefault!: boolean;

  @Column({ type: 'text', name: 'image_file_id', nullable: true })
  imageFileId?: string | null;

  /** Set when catalog.variant.deleted arrives — see class doc comment for why this is a soft marker rather than a real row delete. */
  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt?: Date | null;
}
