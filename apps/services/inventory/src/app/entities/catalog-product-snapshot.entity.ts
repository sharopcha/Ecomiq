import { Column, Entity } from 'typeorm';
import { MoneyTransformer, TenantScopedEntity } from '@temp-nx/typeorm';

/**
 * Local read-model mirror of a catalog-service `product` row — event-carried
 * state transfer, not a real aggregate owned by inventory-service. Inventory-service can't join to catalog_db
 * (ADR-2, database-per-service) but needs product/category display data to
 * render the Inventory list screen (Product name / SKU / Category columns),
 * so it keeps this small local copy instead of calling back into
 * catalog-service on every read.
 *
 * The id is deliberately catalog's own `product.id`, not a fresh ULID — this
 * is a mirror of that row, not a new entity, and reusing the id is what lets
 * `CatalogVariantSnapshot.productId` (and eventually `stock_level.variant_id`)
 * line straight through without a separate mapping table. `BaseEntity`'s
 * `@BeforeInsert generateId()` only fills in an id when one isn't already
 * set, so explicitly assigning catalog's id before insert works cleanly.
 *
 * Populated/kept in sync by CatalogSyncService, which consumes catalog's
 * `catalog.product.created/updated/archived/restored` events (see
 * apps/services/catalog/src/app/products/products.service.ts for the
 * source-of-truth payload shape — there is no shared `libs/contracts`
 * package yet, so `catalog-event-payloads.ts` in this service mirrors it by
 * hand).
 */
@Entity('catalog_product_snapshot')
export class CatalogProductSnapshot extends TenantScopedEntity {
  @Column({ type: 'int', name: 'display_number', nullable: true })
  displayNumber?: number | null;

  @Column({ type: 'text' })
  name!: string;

  /** Base SKU — variants (CatalogVariantSnapshot) carry their own and override this, same relationship as catalog's own product/product_variant. */
  @Column({ type: 'text', nullable: true })
  sku?: string | null;

  /**
   * Plain text, not a Postgres enum — this is a read replica of catalog's
   * `product_status`/`product_kind` enums, not the source of truth for their
   * valid values. Keeping it as text means catalog can add a new enum value
   * without inventory-service needing a matching migration first.
   */
  @Column({ type: 'text' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  kind?: string | null;

  @Column({ type: 'text', name: 'category_id', nullable: true })
  categoryId?: string | null;

  /** Denormalized alongside categoryId specifically so this snapshot can render a readable Category column — see the categoryName comment in catalog's products.service.ts. */
  @Column({ type: 'text', name: 'category_name', nullable: true })
  categoryName?: string | null;

  @Column({
    type: 'bigint',
    name: 'price_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  priceMinor?: number | null;

  @Column({
    type: 'bigint',
    name: 'compare_at_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  compareAtMinor?: number | null;

  /**
   * Mirrors catalog's `product.deleted_at` (set on catalog.product.archived,
   * cleared on catalog.product.restored) — a separate column rather than a
   * real `@DeleteDateColumn`/`SoftDeletableEntity`, since TypeORM's soft-delete
   * machinery (`softRemove`/`restore`, auto-filtering `find*`) is designed
   * around *this service* deciding to delete a row, not around mirroring
   * another service's already-decided state. Callers filter on it explicitly.
   */
  @Column({ type: 'timestamptz', name: 'archived_at', nullable: true })
  archivedAt?: Date | null;
}
