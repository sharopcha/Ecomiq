import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';
import { Product } from './product.entity';

export enum LicenseKeyStatus {
  Available = 'available',
  Assigned = 'assigned',
  Revoked = 'revoked',
}

/**
 * A pool of pre-generated redemption codes for a digital product (game keys,
 * software licenses, ...). `order_line_id` is a plain reference, not a real
 * FK — order-service owns orders in its own database (no cross-service
 * FKs), and calls `reserveNext()` (LicenseKeysService) to hand a key out at
 * checkout.
 */
@Entity('license_key')
export class LicenseKey extends TenantScopedEntity {
  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'text', name: 'key_value' })
  keyValue!: string;

  @Column({ type: 'text', name: 'order_line_id', nullable: true })
  orderLineId?: string | null;

  /**
   * Plain `text` column (not a Postgres `enum` type, unlike product.status) —
   * matches the DDL literally (`status text DEFAULT 'available'`). The TS
   * enum is just for code-level type safety; storing it as `enum` type
   * would be a schema strictness beyond what the source model calls for.
   */
  @Column({ type: 'text', default: LicenseKeyStatus.Available })
  status!: LicenseKeyStatus;
}
