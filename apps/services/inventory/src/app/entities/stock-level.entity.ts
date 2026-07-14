import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { MoneyTransformer, TenantScopedEntity } from '@temp-nx/typeorm';
import { Location } from './location.entity';

/**
 * The inventory cell — variant × location. "Available = on_hand -
 * reserved". This is the one row everything else in inventory-service
 * ultimately revolves around.
 *
 * `variantId` is a plain column, not a `@ManyToOne`/`@JoinColumn` relation —
 * same reasoning as `CatalogVariantSnapshot.productId`: it points
 * at the *snapshot* mirror table (event-carried state from catalog-service),
 * and StockLevelsService validates existence/ownership explicitly rather
 * than leaning on a DB-level FK. `location`, by contrast, *is* a real
 * relation — `Location` is a genuine entity owned by inventory-service
 * itself, same as catalog's own Category/Vendor/Type relations on
 * `Product`. Relation-only, no parallel scalar `locationId` column — same
 * convention as catalog's `ProductVariant`/`Category` (a dual-mapped scalar +
 * relation on the same column is only needed for a *composite primary key*
 * built from a relation, e.g. `BundleItem`; a plain FK relation doesn't need
 * it, and `@Unique` can reference the relation property directly, exactly
 * like `ProductVariant`'s `@Unique(['product', 'sku'])`).
 *
 * `onHand`/`reserved` are deliberately **not** directly writable through this
 * module's own create/update endpoints (see stock-levels.service.ts) —
 * stock_movement is the one place that ever changes them, so the ledger
 * stays authoritative. This entity only owns the *shape* of the cell
 * (which variant, which location, the low-stock threshold, unit cost).
 */
@Entity('stock_level')
@Unique(['variantId', 'location'])
export class StockLevel extends TenantScopedEntity {
  @Index()
  @Column({ type: 'text', name: 'variant_id' })
  variantId!: string;

  @ManyToOne(() => Location, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'location_id' })
  location!: Location;

  @Column({ type: 'int', name: 'on_hand', default: 0 })
  onHand!: number;

  @Column({ type: 'int', default: 0 })
  reserved!: number;

  /** Drives the Low/High badge on the Inventory list — null means "not tracked," never triggers a low-stock signal. */
  @Column({ type: 'int', name: 'low_threshold', nullable: true })
  lowThreshold?: number | null;

  @Column({
    type: 'bigint',
    name: 'unit_cost_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  unitCostMinor?: number | null;
}
