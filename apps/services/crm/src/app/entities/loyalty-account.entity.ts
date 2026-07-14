import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

export enum LoyaltyTier {
  Bronze = 'bronze',
  Silver = 'silver',
  Gold = 'gold',
}

/** One account per (store, customer) — `customer_id` is unique per store, same-DB FK. */
@Entity('loyalty_account')
export class LoyaltyAccount extends TenantScopedEntity {
  @Index({ unique: true })
  @Column({ type: 'text', name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'int', default: 0 })
  points!: number;

  @Column({ type: 'text', default: LoyaltyTier.Bronze })
  tier!: LoyaltyTier;
}
