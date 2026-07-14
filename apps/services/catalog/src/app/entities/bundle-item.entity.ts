import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Bundle } from './bundle.entity';
import { ProductVariant } from './product-variant.entity';

/**
 * Join row for `bundle` <-> `product_variant`, with its own `qty` — a real
 * entity rather than a plain @ManyToMany/@JoinTable (like product_channel/
 * product_tag), since `qty` makes this more than a bare join
 * (`PRIMARY KEY(bundle_id, variant_id)`). No id/timestamps of its own,
 * matching the DDL literally.
 *
 * Composite primary key via a relation needs both a `@Column({ primary: true })`
 * for the id column *and* a `@ManyToOne` + `@JoinColumn` mapped to that same
 * column name — TypeORM's documented pattern for this case (unlike
 * Category's self-relation, which only needs the relation since `parent_id`
 * isn't part of any composite key there).
 */
@Entity('bundle_item')
export class BundleItem {
  @Column({ type: 'text', name: 'bundle_id', primary: true })
  bundleId!: string;

  @Column({ type: 'text', name: 'variant_id', primary: true })
  variantId!: string;

  @ManyToOne(() => Bundle, (bundle) => bundle.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bundle_id' })
  bundle!: Bundle;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant;

  @Column({ type: 'int' })
  qty!: number;
}
