import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedEntity } from '@temp-nx/typeorm';
import { Product } from './product.entity';

/**
 * `file_id` references `file_asset(id)`, but there's no media service /
 * `file_asset` table yet — stored here as a plain, unvalidated string id
 * (same call already made for `imageFileId` on
 * ProductOptionValue/ProductVariant), not a TypeORM relation. Whatever
 * eventually owns file storage can validate/resolve it; this table just
 * remembers "this product has this file id, in this order."
 */
@Entity('product_image')
export class ProductImage extends TimestampedEntity {
  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'text', name: 'file_id' })
  fileId!: string;

  @Column({ type: 'int', default: 0 })
  position!: number;
}
