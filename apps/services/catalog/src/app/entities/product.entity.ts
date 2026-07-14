import { Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, Unique } from 'typeorm';
import { MoneyTransformer, TenantScopedSoftDeletableEntity } from '@temp-nx/typeorm';
import { Category } from './category.entity';
import { ProductType } from './product-type.entity';
import { Vendor } from './vendor.entity';
import { Channel } from './channel.entity';
import { Tag } from './tag.entity';

export enum ProductStatus {
  Draft = 'draft',
  Active = 'active',
  Archived = 'archived',
  Discontinued = 'discontinued',
}

export enum ProductKind {
  Physical = 'physical',
  Digital = 'digital',
}

/**
 * Core product record. Variants/options/images are separate tables — this
 * entity is the "parent" row: identity, pricing defaults (overridable
 * per-variant), physical shipping attributes, and the taxonomy relations
 * (category/type/vendor).
 *
 * `display_number` (+ `UNIQUE(store_id, display_number)`) is the per-tenant
 * sequence behind UI strings like "Product 12.567 out of 32.068" — assigned
 * by the service layer (next value for the store), not by a DB sequence,
 * since it's scoped per-store rather than globally.
 */
@Entity('product')
@Unique(['storeId', 'displayNumber'])
export class Product extends TenantScopedSoftDeletableEntity {
  @Column({ type: 'int', name: 'display_number' })
  displayNumber!: number;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    enumName: 'product_status',
    default: ProductStatus.Draft,
  })
  status!: ProductStatus;

  @Column({
    type: 'enum',
    enum: ProductKind,
    enumName: 'product_kind',
    default: ProductKind.Physical,
  })
  kind!: ProductKind;

  /** Base SKU — variants carry their own and override this. */
  @Column({ type: 'text', nullable: true })
  sku?: string | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category?: Category | null;

  @ManyToOne(() => ProductType, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'type_id' })
  type?: ProductType | null;

  @ManyToOne(() => Vendor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vendor_id' })
  vendor?: Vendor | null;

  // ── Pricing — screens: Price / Compare-at price / Cost per item, with
  // Sales price/Profit/Gross margin derived client-side from these. ────────
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

  @Column({
    type: 'bigint',
    name: 'cost_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  costMinor?: number | null;

  @Column({
    type: 'bigint',
    name: 'wholesale_min_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  wholesaleMinMinor?: number | null;

  @Column({
    type: 'bigint',
    name: 'wholesale_max_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  wholesaleMaxMinor?: number | null;

  @Column({ type: 'boolean', name: 'charge_tax', default: false })
  chargeTax!: boolean;

  // ── Shipping (Physical product only, but columns stay nullable rather
  // than split into a separate table — Digital products just leave them null). ─
  @Column({ type: 'numeric', precision: 10, scale: 3, name: 'weight_value', nullable: true })
  weightValue?: number | null;

  @Column({ type: 'text', name: 'weight_unit', default: 'kg' })
  weightUnit!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'length_cm', nullable: true })
  lengthCm?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'width_cm', nullable: true })
  widthCm?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'height_cm', nullable: true })
  heightCm?: number | null;

  @Column({ type: 'boolean', name: 'ships_internationally', default: false })
  shipsInternationally!: boolean;

  @Column({ type: 'boolean', name: 'continue_selling_oos', default: false })
  continueSellingOos!: boolean;

  @Column({ type: 'boolean', name: 'is_dropship', default: false })
  isDropship!: boolean;

  @Column({ type: 'numeric', precision: 2, scale: 1, name: 'rating_avg', nullable: true })
  ratingAvg?: number | null;

  @Column({ type: 'int', name: 'rating_count', default: 0 })
  ratingCount!: number;

  /**
   * DB-generated full-text search column (Postgres `GENERATED ALWAYS AS ...
   * STORED`) — TypeORM never writes to this, Postgres derives it from
   * name/sku on every insert/update. `select: false` because it's an
   * internal search index, not something the API should ever need to
   * serialize back to a client; query it explicitly
   * (`qb.addSelect('product.search')` or a raw `@@ to_tsquery(...)`) when
   * full-text search lands.
   */
  @Column({
    type: 'tsvector',
    nullable: true,
    select: false,
    asExpression: `to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(sku,''))`,
    generatedType: 'STORED',
  })
  @Index()
  search?: string;

  // ── Taxonomy joins (`product_channel`/`product_tag`, both plain
  // composite-PK join tables with no attributes of their own) — modeled as
  // plain @ManyToMany/@JoinTable rather than separate junction entities,
  // since there's nothing on the join row itself to justify one. ──
  @ManyToMany(() => Channel)
  @JoinTable({
    name: 'product_channel',
    joinColumn: { name: 'product_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'channel_id', referencedColumnName: 'id' },
  })
  channels?: Channel[];

  @ManyToMany(() => Tag)
  @JoinTable({
    name: 'product_tag',
    joinColumn: { name: 'product_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags?: Tag[];
}
