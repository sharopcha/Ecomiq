import { Column, Entity } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

/**
 * Warehouse. Plain tenant-scoped table — no soft-delete (`deleted_at` only
 * appears where the UI has an Archive action; locations don't), no
 * parent/hierarchy.
 *
 * `isActive` backs the "Main warehouse" toggle on a product's Stock section;
 * `isDefault` backs the implicit "which warehouse is the fallback ship-from/
 * receive-to location" — exclusivity for that flag (at most one default per
 * store) is enforced in LocationsService, not here.
 */
@Entity('location')
export class Location extends TenantScopedEntity {
  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', name: 'is_default', default: false })
  isDefault!: boolean;

  @Column({ type: 'text', name: 'address_line1', nullable: true })
  addressLine1?: string | null;

  @Column({ type: 'text', name: 'address_line2', nullable: true })
  addressLine2?: string | null;

  @Column({ type: 'text', nullable: true })
  city?: string | null;

  @Column({ type: 'text', nullable: true })
  region?: string | null;

  @Column({ type: 'text', name: 'postal_code', nullable: true })
  postalCode?: string | null;

  @Column({ type: 'char', length: 2, name: 'country_code', nullable: true })
  countryCode?: string | null;
}
