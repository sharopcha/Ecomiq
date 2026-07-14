import { Column, Entity } from 'typeorm';
import { NumericTransformer, TenantScopedEntity } from '@temp-nx/typeorm';

export enum SupplierStatus {
  Active = 'active',
  Inactive = 'inactive',
}

/**
 * `rating_avg`/`rating_count` are denormalized rollups recomputed
 * in-transaction by `SupplierReviewsService` (Step 4) — same-DB, no event
 * round-trip (contrast with crm→catalog's cross-DB review-rollup consumer).
 * `password_hash`/`registered_at` are additive nullable columns for the
 * supplier-portal auth principal (Step 11) — admin-created suppliers simply
 * have none until they register. `last_logged_in_at` is stamped on supplier
 * login (Step 11), resolving the data model's `[GAP]` comment.
 */
@Entity('supplier')
export class Supplier extends TenantScopedEntity {
  @Column({ type: 'text', name: 'display_id' })
  displayId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'text', nullable: true })
  phone?: string | null;

  @Column({ type: 'citext', nullable: true })
  email?: string | null;

  @Column({ type: 'text', nullable: true })
  website?: string | null;

  @Column({ type: 'text', name: 'address_line1', nullable: true })
  addressLine1?: string | null;

  @Column({ type: 'text', nullable: true })
  city?: string | null;

  @Column({ type: 'text', nullable: true })
  region?: string | null;

  @Column({ type: 'text', name: 'postal_code', nullable: true })
  postalCode?: string | null;

  @Column({ type: 'char', name: 'country_code', length: 2, nullable: true })
  countryCode?: string | null;

  @Column({ type: 'text', name: 'location_label', nullable: true })
  locationLabel?: string | null;

  @Column({ type: 'text', name: 'shipping_carriers', array: true, nullable: true })
  shippingCarriers?: string[] | null;

  @Column({ type: 'enum', enum: SupplierStatus, enumName: 'supplier_status', default: SupplierStatus.Active })
  status!: SupplierStatus;

  @Column({ type: 'boolean', name: 'is_featured', default: false })
  isFeatured!: boolean;

  @Column({ type: 'boolean', name: 'is_favorite', default: false })
  isFavorite!: boolean;

  @Column({
    type: 'numeric',
    name: 'rating_avg',
    precision: 2,
    scale: 1,
    nullable: true,
    transformer: NumericTransformer,
  })
  ratingAvg?: number | null;

  @Column({ type: 'int', name: 'rating_count', default: 0 })
  ratingCount!: number;

  @Column({ type: 'timestamptz', name: 'joined_at', nullable: true })
  joinedAt?: Date | null;

  @Column({ type: 'timestamptz', name: 'last_logged_in_at', nullable: true })
  lastLoggedInAt?: Date | null;

  @Column({ type: 'text', name: 'password_hash', nullable: true })
  passwordHash?: string | null;

  @Column({ type: 'timestamptz', name: 'registered_at', nullable: true })
  registeredAt?: Date | null;
}
