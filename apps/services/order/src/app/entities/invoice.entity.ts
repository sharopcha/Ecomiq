import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';
import { Order } from './order.entity';

/**
 * An immutable snapshot of an order's totals at the moment `POST
 * /api/orders/:id/invoice` was called — `totals` is a jsonb
 * copy, not a live reference, so later order edits never rewrite an
 * already-issued invoice.
 *
 * Extends `BaseEntity` (id + manual `storeId`, no `updatedAt`) — an
 * invoice is never updated after creation, same "append-only, no
 * `updatedAt`" reasoning as `StockMovement`/`WebhookInbox`.
 */
@Entity('invoice')
export class Invoice extends BaseEntity {
  @Index()
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @Index()
  @ManyToOne(() => Order, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ type: 'text', name: 'display_id' })
  displayId!: string;

  @Column({ type: 'timestamptz', name: 'issued_at', default: () => 'now()' })
  issuedAt!: Date;

  /** Snapshot of subtotal/shipping/discount/tax/total at issue time — see class doc comment. */
  @Column({ type: 'jsonb' })
  totals!: Record<string, unknown>;
}
