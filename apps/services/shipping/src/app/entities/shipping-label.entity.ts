import { Column, Entity, OneToMany } from 'typeorm';
import { MoneyTransformer, TenantScopedEntity } from '@temp-nx/typeorm';
import { ShippingLabelPackage } from './shipping-label-package.entity';

/**
 * Create Shipping Label modal — a draft until purchased. `orderId` is a
 * plain snapshot-reference column, not a cross-DB FK: order lives in
 * order_db (ADR-2, database-per-service). `labelFileId` is likewise a
 * plain nullable column (no media-service yet) that will hold a
 * carrier-provider-fabricated URL once purchasing lands.
 */
@Entity('shipping_label')
export class ShippingLabel extends TenantScopedEntity {
  @Column({ type: 'text', name: 'order_id' })
  orderId!: string;

  @Column({ type: 'text' })
  carrier!: string;

  @Column({ type: 'text', name: 'service_type', nullable: true })
  serviceType?: string | null;

  @Column({ type: 'text', nullable: true })
  insurance?: string | null;

  @Column({ type: 'date', name: 'ship_date', nullable: true })
  shipDate?: string | null;

  @Column({ type: 'boolean', name: 'notify_customer', default: false })
  notifyCustomer!: boolean;

  /** Store return-address snapshot at draft time. */
  @Column({ type: 'jsonb', name: 'return_address', nullable: true })
  returnAddress?: Record<string, unknown> | null;

  /**
   * Destination-address snapshot, additive vs. the original DDL (same
   * snapshot-column reasoning as `returnAddress`). Persisted at draft
   * creation so `purchaseLabel(label)` can read `destinationAddress.postalCode`
   * for the carrier port's deterministic-failure check without the caller
   * having to resupply it at purchase time.
   */
  @Column({ type: 'jsonb', name: 'destination_address', nullable: true })
  destinationAddress?: Record<string, unknown> | null;

  @Column({ type: 'bigint', name: 'subtotal_minor', nullable: true, transformer: MoneyTransformer })
  subtotalMinor?: number | null;

  @Column({ type: 'bigint', name: 'discount_minor', nullable: true, transformer: MoneyTransformer })
  discountMinor?: number | null;

  @Column({ type: 'bigint', name: 'total_minor', nullable: true, transformer: MoneyTransformer })
  totalMinor?: number | null;

  @Column({ type: 'text', name: 'label_file_id', nullable: true })
  labelFileId?: string | null;

  @Column({ type: 'timestamptz', name: 'purchased_at', nullable: true })
  purchasedAt?: Date | null;

  @OneToMany(() => ShippingLabelPackage, (pkg) => pkg.label)
  packages?: ShippingLabelPackage[];
}
