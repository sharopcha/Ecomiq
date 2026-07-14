import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';
import { StockLevel } from './stock-level.entity';

/** Matches the Postgres enum `stock_movement_kind` verbatim. */
export enum StockMovementKind {
  Sale = 'sale',
  Return = 'return',
  PurchaseReceipt = 'purchase_receipt',
  Adjustment = 'adjustment',
  Reservation = 'reservation',
  Release = 'release',
  Transfer = 'transfer',
}

/**
 * Append-only audit trail — "Stock History" on the Inventory list's row
 * actions — and the *only* place `stock_level.on_hand`/`.reserved` are ever
 * mutated (see StockMovementsService.record()). Every other step
 * (Audit Stock, reservations, reorder receipts) works by calling into that
 * one method rather than touching StockLevel directly, so this ledger is
 * always a complete, ordered history of every change.
 *
 * Extends `BaseEntity` (id only), not `TenantScopedEntity` — same reasoning
 * as `OutboxMessage`: the DDL (`stock_movement`) has `created_at` but no
 * `updated_at`, because rows are never updated after insert. `storeId` is
 * added manually below (identical column to what `TenantScopedEntity` would
 * give us) without the `updatedAt` column that class also carries and which
 * would misleadingly imply this row can change.
 *
 * `stockLevel` is a real relation-only FK (RESTRICT — a movement must never
 * be able to outlive the cell it describes), matching the dominant
 * relation-only convention (`Category.parent`, `ProductVariant.product`,
 * `StockLevel.location`) rather than a dual-mapped scalar + relation, since
 * there's no composite primary key here (see stock-level.entity.ts's doc
 * comment for when dual-mapping actually is needed).
 *
 * `(ref_table, ref_id)` carries an additive partial unique index scoped to
 * `ref_table = 'purchase_order'` — purchasing-service's `po.events` consumer
 * (`PurchasingSyncService`) is the first caller for whom `ref_table`/`ref_id`
 * need to be replay-proof: an *additive* increment (unlike order-service's
 * state-based reservation checks) has no other way to detect "have I already
 * applied this exact movement." `ref_id` there is a natural key
 * (`<poId>:<lineId>:<cumulativeReceivedQty>`), so every distinct partial
 * receipt gets its own row and a replayed event's insert fails the
 * constraint instead of double-counting stock. Scoped to just this one
 * `ref_table` value (crm's partial-unique-index precedent) rather than
 * every row, since no other producer needs — or could even guarantee — a
 * globally unique `ref_id`.
 */
@Entity('stock_movement')
@Index(['refTable', 'refId'], { unique: true, where: "ref_table = 'purchase_order'" })
export class StockMovement extends BaseEntity {
  @Index()
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @Index()
  @ManyToOne(() => StockLevel, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stock_level_id' })
  stockLevel!: StockLevel;

  @Column({
    type: 'enum',
    enum: StockMovementKind,
    enumName: 'stock_movement_kind',
  })
  kind!: StockMovementKind;

  /**
   * Signed change applied to whichever field the kind targets (onHand or
   * reserved — see stock-movements.service.ts's targetFieldForKind). E.g. a
   * sale passes a negative qtyDelta, a purchase_receipt a positive one.
   */
  @Column({ type: 'int', name: 'qty_delta' })
  qtyDelta!: number;

  /** What triggered this movement — order/po/audit/reservation id. Free-form since those tables don't live in this service's DB (ADR-2). */
  @Column({ type: 'text', name: 'ref_table', nullable: true })
  refTable?: string | null;

  @Column({ type: 'text', name: 'ref_id', nullable: true })
  refId?: string | null;

  /** Who/what caused it — an app_user id when a human acted (e.g. Audit Stock), null for system-driven movements (e.g. an order-service consumer, once built). */
  @Column({ type: 'text', name: 'actor_id', nullable: true })
  actorId?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
