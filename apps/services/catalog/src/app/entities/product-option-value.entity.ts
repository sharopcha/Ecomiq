import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedEntity } from '@temp-nx/typeorm';
import { ProductOption } from './product-option.entity';

/** "Midnight"/"Silver"/"Starlight"; "256GB"/"512GB"/"1TB" — one value of a ProductOption. */
@Entity('product_option_value')
export class ProductOptionValue extends TimestampedEntity {
  @ManyToOne(() => ProductOption, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'option_id' })
  option!: ProductOption;

  @Column({ type: 'text' })
  value!: string;

  @Column({ type: 'text', nullable: true })
  swatch?: string | null;

  /**
   * References `file_asset(id)` per the data model, but `file_asset` doesn't
   * exist yet — stored as a plain id for now rather than a broken/forward
   * relation. This can be upgraded to a real `@ManyToOne` once `FileAsset`
   * exists, or left as a bare id if images end up managed independently
   * (both are common patterns for media refs).
   */
  @Column({ type: 'text', name: 'image_file_id', nullable: true })
  imageFileId?: string | null;

  @Column({ type: 'int', default: 0 })
  position!: number;
}
