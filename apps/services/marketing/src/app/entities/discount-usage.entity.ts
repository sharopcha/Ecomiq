import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';
import { Discount } from './discount.entity';

/**
 * One row per order that actually redeemed a discount — inserted by the
 * `orders.order.placed` consumer, never directly by `DiscountsService`
 * (a validate-then-abandon checkout must not burn the code — see
 * `ValidateDiscount`'s doc comment in the proto). Unique
 * `(discount_id, order_id)` is the actual usage-count
 * safeguard: one usage per order, and the idempotent-insert-conflict path
 * the order-events consumer relies on.
 *
 * Extends `BaseEntity` (id only), not `TenantScopedEntity` — same
 * reasoning as `OutboxMessage`/inventory's `StockMovement`: this row is
 * never updated after insert (`usedAt` is the one meaningful timestamp),
 * so a separate `updatedAt` column would misleadingly imply otherwise.
 * `storeId` is added manually, identical column to what `TenantScopedEntity`
 * would give.
 *
 * `orderId`/`customerId` are plain text columns, not relations — they
 * reference order-service's own tables in a different database (ADR-2),
 * same convention as payment-service's `Payment.orderId`.
 */
@Entity('discount_usage')
@Unique(['discount', 'orderId'])
export class DiscountUsage extends BaseEntity {
  @Index()
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @Index()
  @ManyToOne(() => Discount, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'discount_id' })
  discount!: Discount;

  @Column({ type: 'text', name: 'order_id' })
  orderId!: string;

  /** Queried for the `oncePerCustomer` check — see `validate-discount.util.ts`. */
  @Index()
  @Column({ type: 'text', name: 'customer_id', nullable: true })
  customerId?: string | null;

  @Column({ type: 'timestamptz', name: 'used_at', default: () => 'now()' })
  usedAt!: Date;
}
