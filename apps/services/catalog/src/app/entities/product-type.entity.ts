import { Column, Entity } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

/** Table is `product_type_lu` (lookup table for product.product_type_id). */
@Entity('product_type_lu')
export class ProductType extends TenantScopedEntity {
  @Column({ type: 'text' })
  name!: string;
}
