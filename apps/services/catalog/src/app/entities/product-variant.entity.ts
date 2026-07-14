import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, Unique } from 'typeorm';
import { MoneyTransformer, TimestampedEntity } from '@temp-nx/typeorm';
import { Product } from './product.entity';
import { ProductOptionValue } from './product-option-value.entity';

/**
 * One row per option-value combination (e.g. Color=Midnight × Storage=256GB),
 * each with its own SKU/price/stock/default flag. Stock itself
 * (`stock_level`) lives in inventory_db, out of scope here.
 */
@Entity('product_variant')
@Unique(['product', 'sku'])
export class ProductVariant extends TimestampedEntity {
  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'text' })
  sku!: string;

  /** Overrides `product.price_minor` when set; null means "inherit the product's price." */
  @Column({
    type: 'bigint',
    name: 'price_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  priceMinor?: number | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  /** "Make default" — exactly one variant per product should have this set; enforced in ProductVariantsService, not the DB. */
  @Column({ type: 'boolean', name: 'is_default', default: false })
  isDefault!: boolean;

  /** Same forward-reference caveat as ProductOptionValue.imageFileId — see that entity's comment. */
  @Column({ type: 'text', name: 'image_file_id', nullable: true })
  imageFileId?: string | null;

  /** The specific combination this row represents — exactly one value per product option. */
  @ManyToMany(() => ProductOptionValue)
  @JoinTable({
    name: 'variant_option_value',
    joinColumn: { name: 'variant_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'option_value_id', referencedColumnName: 'id' },
  })
  optionValues?: ProductOptionValue[];
}
