import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity, MoneyTransformer } from '@temp-nx/typeorm';
import { StockLevel } from './stock-level.entity';

/** Matches the Postgres enum `stock_adjust_type` — the Audit Stock modal's Quantity/Value Adjustment toggle. */
export enum StockAdjustType {
  Quantity = 'quantity',
  Value = 'value',
}

/** Matches the Postgres enum `stock_adjust_reason` — the Audit Stock modal's 6 reason chips. */
export enum StockAdjustReason {
  Damage = 'damage',
  Expire = 'expire',
  Misplacement = 'misplacement',
  Thief = 'thief',
  StocktakeVariance = 'stocktake_variance',
  Custom = 'custom',
}

/**
 * The Audit Stock modal's submitted record + the "Stock adjustment history"
 * right rail. Append-only, same reasoning as
 * `StockMovement`/`OutboxMessage` — the DDL's `created_at`-only, no
 * `updated_at`, so this extends `BaseEntity` with a manual `storeId` rather
 * than `TenantScopedEntity`.
 *
 * Two disjoint shapes live in one row, matching the DDL exactly rather than
 * splitting into two tables — `adjustType` says which half is populated:
 *  - `quantity`: `physicalCount`/`availableBefore`/`discrepancy` are set,
 *    `valueDeltaMinor` stays null. A non-zero discrepancy also produces a
 *    `stock_movement(kind=adjustment)` (see StockAuditsService.create) —
 *    this row is the *reason*, that row is the *mutation*.
 *  - `value`: only `valueDeltaMinor` is set (a monetary write-off/impairment
 *    note, e.g. "goods damaged but count unchanged") — no stock_movement is
 *    recorded, since nothing about on_hand/reserved actually changed.
 *
 * `stockLevel` is a relation-only FK (`onDelete: 'RESTRICT'`), same
 * convention as `StockMovement.stockLevel` — no composite key, so no
 * dual-mapping.
 */
@Entity('stock_audit')
export class StockAudit extends BaseEntity {
  @Index()
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @Index()
  @ManyToOne(() => StockLevel, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stock_level_id' })
  stockLevel!: StockLevel;

  @Column({
    type: 'enum',
    enum: StockAdjustType,
    enumName: 'stock_adjust_type',
    name: 'adjust_type',
    default: StockAdjustType.Quantity,
  })
  adjustType!: StockAdjustType;

  /** "Physical Count" field — the counted quantity, quantity-mode only. */
  @Column({ type: 'int', name: 'physical_count', nullable: true })
  physicalCount?: number | null;

  /** "Available" field — `stock_level.on_hand - .reserved` as it stood *before* this audit was applied (both modes, for historical context). */
  @Column({ type: 'int', name: 'available_before', nullable: true })
  availableBefore?: number | null;

  /** Auto-computed `physicalCount - availableBefore`, quantity-mode only — this is the qtyDelta forwarded to the stock_movement ledger. */
  @Column({ type: 'int', nullable: true })
  discrepancy?: number | null;

  /** Value-mode only — a monetary write-off/impairment amount, no quantity change. */
  @Column({
    type: 'bigint',
    name: 'value_delta_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  valueDeltaMinor?: number | null;

  @Column({
    type: 'enum',
    enum: StockAdjustReason,
    enumName: 'stock_adjust_reason',
  })
  reason!: StockAdjustReason;

  /** e.g. "Evaluate if the damage is repairable…" (Audit Stock modal's Note field). */
  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** Who performed the audit — set from the authenticated user, never client-supplied. */
  @Column({ type: 'text', name: 'actor_id', nullable: true })
  actorId?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
