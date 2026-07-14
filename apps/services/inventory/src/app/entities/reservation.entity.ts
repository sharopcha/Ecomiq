import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';
import { StockLevel } from './stock-level.entity';

/**
 * "Reserve Item … secure it for 24 hours" / "Your reserved item will be set
 * until 16:45". A time-boxed hold against a
 * stock_level's `reserved` quantity — created here, released either
 * explicitly (`ReservationsService.release()`) or automatically once
 * `reservedUntil` passes.
 *
 * Extends `TenantScopedEntity` (real created_at/updated_at) rather than
 * the append-only `BaseEntity` pattern `StockMovement`/`StockAudit` use —
 * this row has a genuine lifecycle (active -> released/expired), same
 * reasoning as `Location`/`StockLevel`/`StockAlert`: the DDL excerpt omits
 * timestamps but this is a real mutable row, not a ledger entry.
 *
 * `stockLevel` is a real relation-only FK (`onDelete: 'RESTRICT'`), same
 * convention as `StockMovement.stockLevel`/`StockAudit.stockLevel` — no
 * composite key, so no dual-mapping.
 *
 * `orderId`/`orderLineId` are plain nullable columns, **not** relations —
 * order-service doesn't exist yet (ADR-2, no cross-service FKs even once it
 * does), and the DDL itself doesn't mark them `NOT NULL`: a reservation can
 * be an ad hoc "Reserve Item" hold with no order behind it yet, same as the
 * merchant-initiated row action the screenshots show, not only an
 * order-checkout-triggered one.
 */
@Entity('reservation')
export class Reservation extends TenantScopedEntity {
  @Index()
  @ManyToOne(() => StockLevel, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stock_level_id' })
  stockLevel!: StockLevel;

  /** Opaque reference into order-service's future `order` table — see class doc comment for why this isn't a relation. */
  @Column({ type: 'text', name: 'order_id', nullable: true })
  orderId?: string | null;

  @Column({ type: 'text', name: 'order_line_id', nullable: true })
  orderLineId?: string | null;

  @Column({ type: 'int' })
  qty!: number;

  /** Fixed 24h-from-creation deadline (see ReservationsService.RESERVATION_HOLD_HOURS) — the auto-expiry Pulsar delayed message fires at this instant to auto-release if nothing else has by then. */
  @Column({ type: 'timestamptz', name: 'reserved_until' })
  reservedUntil!: Date;

  /** Null while the hold is active. Set by either an explicit release or the 24h auto-expiry — both are terminal, mutually exclusive outcomes for a given reservation. */
  @Column({ type: 'timestamptz', name: 'released_at', nullable: true })
  releasedAt?: Date | null;

  /**
   * Retry safety for the gRPC `ReserveStock` call: order-service's saga
   * sets this to a caller-chosen key per order line (expected to already
   * be globally unique, e.g. a
   * ULID — not scoped per store), and `ReservationGrpcController` checks
   * for an existing row with the same `idempotency_key` before creating a
   * new one, returning the original reservation instead of double-reserving
   * on a retried call (timeout, redelivery, etc.). Null for reservations
   * created via the REST API (`ReservationsService.create()` doesn't set
   * it) — a plain unique index allows unlimited NULLs in Postgres, so this
   * doesn't collide with those rows.
   */
  @Index({ unique: true })
  @Column({ type: 'text', name: 'idempotency_key', nullable: true })
  idempotencyKey?: string | null;
}
