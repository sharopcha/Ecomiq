import { Column, Entity, Index } from 'typeorm';
import { TimestampedEntity } from '@temp-nx/typeorm';

/**
 * No `store_id` of its own, per the data model — scoped only through
 * `customer_id` (same-DB FK, `ON DELETE CASCADE`). Every access must go
 * through `assertCustomerOwned` first (see customer-addresses.service.ts) so
 * a request can't read/mutate another store's address just by guessing an
 * address id — same "no store_id of its own" shape as catalog's
 * ProductOption/ProductVariant.
 */
@Entity('customer_address')
export class CustomerAddress extends TimestampedEntity {
  @Index()
  @Column({ type: 'text', name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'text' })
  line1!: string;

  @Column({ type: 'text', nullable: true })
  line2?: string | null;

  @Column({ type: 'text', nullable: true })
  city?: string | null;

  @Column({ type: 'text', nullable: true })
  region?: string | null;

  @Column({ type: 'text', name: 'postal_code', nullable: true })
  postalCode?: string | null;

  @Column({ type: 'char', name: 'country_code', length: 2, nullable: true })
  countryCode?: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  lat?: number | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  lng?: number | null;

  @Column({ type: 'boolean', name: 'is_default_shipping', default: false })
  isDefaultShipping!: boolean;

  @Column({ type: 'boolean', name: 'is_default_billing', default: false })
  isDefaultBilling!: boolean;
}
