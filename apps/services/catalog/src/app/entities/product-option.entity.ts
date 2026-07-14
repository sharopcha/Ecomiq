import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { TimestampedEntity } from '@temp-nx/typeorm';
import { Product } from './product.entity';
import { ProductOptionValue } from './product-option-value.entity';

/**
 * "Color", "SSD Size" — an axis of variation for a product. No `store_id`
 * of its own: unlike the taxonomy tables (vendor/category/tag/etc.), this
 * (and ProductOptionValue/ProductVariant) always hangs off a specific `product_id`,
 * and tenant isolation flows transitively through `product.store_id` — see
 * `product-ownership.util.ts`, which every option/variant endpoint calls
 * before touching anything here.
 */
@Entity('product_option')
export class ProductOption extends TimestampedEntity {
  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'int', default: 0 })
  position!: number;

  /** "Use image for this variant" — lets each option value carry a swatch image instead of just a text label. */
  @Column({ type: 'boolean', name: 'use_images', default: false })
  useImages!: boolean;

  @OneToMany(() => ProductOptionValue, (value) => value.option)
  values?: ProductOptionValue[];
}
