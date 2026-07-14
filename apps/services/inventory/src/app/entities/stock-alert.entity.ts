import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

/** Matches the Postgres enum `alert_operator` — reused here as the Create Stock Alert modal's comparison direction. */
export enum AlertOperator {
  LowerThan = 'lower_than',
  GreaterThan = 'greater_than',
  Equals = 'equals',
}

/** Matches the Postgres enum `alert_action` — the modal's notification method(s). Executing these (sending an actual email/SMS/task) is out of scope here — inventory-service only publishes `inventory.stock.low` with the matched actions attached; a future notification-service consumes it and does the sending. */
export enum AlertAction {
  SendEmail = 'send_email',
  SendInbox = 'send_inbox',
  SendSms = 'send_sms',
  CreateTask = 'create_task',
}

/**
 * "Create Stock Alert" row action — a standing subscription, not a log
 * entry. Extends `TenantScopedEntity` (real
 * created_at/updated_at) like every other config table in this service
 * (Location, StockLevel) — the DDL excerpt doesn't spell out timestamps
 * either, matching that same precedent, unlike the genuinely append-only
 * StockMovement/StockAudit tables which deliberately don't get an
 * `updatedAt`.
 *
 * `variantId` is required (plain column, same "points at the snapshot
 * mirror, ownership validated in the service" convention as
 * `StockLevel.variantId`) — the row action this models is always invoked
 * from one specific Inventory list row. `locationId` is optional (also a
 * plain column, not a relation — it's a filter, never a required
 * structural FK the way `StockLevel.location` is): null means "watch this
 * variant at every location," matching StockLevel/StockMovement's existing
 * "omit locationId = aggregate across warehouses" convention.
 *
 * `StockMovementsService.recordWithManager()` evaluates every
 * active alert matching a stock_level's variantId (and locationId, if set)
 * after each mutation, publishing `inventory.stock.low` the moment a
 * movement makes `available` newly satisfy `direction`/`threshold` — see
 * that method's `checkAndPublishLowStockAlerts` step.
 */
@Entity('stock_alert')
export class StockAlert extends TenantScopedEntity {
  @Index()
  @Column({ type: 'text', name: 'variant_id' })
  variantId!: string;

  @Index()
  @Column({ type: 'text', name: 'location_id', nullable: true })
  locationId?: string | null;

  /** "Stock Trigger Level" equivalent for this alert (independent of stock_level.low_threshold, which only drives the list's Low/High badge). */
  @Column({ type: 'int' })
  threshold!: number;

  @Column({
    type: 'enum',
    enum: AlertOperator,
    enumName: 'alert_operator',
    default: AlertOperator.LowerThan,
  })
  direction!: AlertOperator;

  @Column({
    type: 'enum',
    enum: AlertAction,
    enumName: 'alert_action',
    array: true,
    default: [AlertAction.SendEmail],
  })
  actions!: AlertAction[];

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
