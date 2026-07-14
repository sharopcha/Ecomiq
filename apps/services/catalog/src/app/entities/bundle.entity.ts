import { Column, Entity, OneToMany } from 'typeorm';
import { MoneyTransformer, TenantScopedEntity } from '@temp-nx/typeorm';
import { BundleItem } from './bundle-item.entity';

/**
 * A fixed-price grouping of existing variants sold as one unit — e.g. "buy
 * the laptop + case + mouse for $999". Has no stock/SKU of its own —
 * `bundle_item` just points at variants that already carry their own
 * price/stock; the bundle's price is independent, not a derived sum.
 */
@Entity('bundle')
export class Bundle extends TenantScopedEntity {
  @Column({ type: 'text' })
  name!: string;

  @Column({
    type: 'bigint',
    name: 'price_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  priceMinor?: number | null;

  @OneToMany(() => BundleItem, (item) => item.bundle)
  items?: BundleItem[];
}
