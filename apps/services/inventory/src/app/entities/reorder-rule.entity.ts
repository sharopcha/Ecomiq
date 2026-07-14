import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

/** Matches the Postgres enum `reorder_method` — the Set Automatic Reorder modal's "Reorder method: Purchase order" field. */
export enum ReorderMethod {
  PurchaseOrder = 'purchase_order',
  Manual = 'manual',
  Dropship = 'dropship',
}

/**
 * "Set Automatic Reorder" modal (Stock Trigger Level, Reorder Quantity,
 * Preferred Supplier, Lead Time). Structurally almost identical to
 * `StockAlert` — same "real mutable CRUD row, extends TenantScopedEntity"
 * precedent, same `variantId` required / `locationId` optional-plain-column
 * shape — but with no `direction` column: unlike a stock alert's
 * configurable lower_than/greater_than/equals, a reorder rule's condition
 * is always the one fixed comparison: "when on_hand - reserved ≤
 * trigger_level". `StockMovementsService`'s post-mutation check (alongside
 * the stock-alert check) fires `inventory.reorder.triggered` the moment a
 * movement makes `available` newly satisfy that comparison.
 *
 * `preferredSupplierId` is a **plain nullable column, no relation, no
 * ownership validation** — purchasing-service (which would own `supplier`)
 * doesn't exist yet, and even once it does, ADR-2 (database-per-service)
 * means this can never become a real FK; it stays an opaque string
 * inventory-service just carries along in the event payload for
 * purchasing-service to interpret once it exists.
 */
@Entity('reorder_rule')
export class ReorderRule extends TenantScopedEntity {
  @Index()
  @Column({ type: 'text', name: 'variant_id' })
  variantId!: string;

  /** Omit to trigger on this variant's stock across every warehouse — same convention as StockAlert.locationId. */
  @Index()
  @Column({ type: 'text', name: 'location_id', nullable: true })
  locationId?: string | null;

  @Column({
    type: 'enum',
    enum: ReorderMethod,
    enumName: 'reorder_method',
    default: ReorderMethod.PurchaseOrder,
  })
  method!: ReorderMethod;

  /** "Stock Trigger Level" — fires when available (on_hand - reserved) drops to or below this. */
  @Column({ type: 'int', name: 'trigger_level' })
  triggerLevel!: number;

  /** "Reorder Quantity" — how much to reorder once triggered; inventory-service doesn't act on this itself, just carries it in the event payload. */
  @Column({ type: 'int', name: 'reorder_qty' })
  reorderQty!: number;

  /** Opaque reference into purchasing-service's future `supplier` table — see class doc comment for why this isn't a relation. */
  @Column({ type: 'text', name: 'preferred_supplier_id', nullable: true })
  preferredSupplierId?: string | null;

  @Column({ type: 'int', name: 'lead_time_days', nullable: true })
  leadTimeDays?: number | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
