import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';
import { Order } from './order.entity';

export enum ReturnStatus {
  PendingApproval = 'pending_approval',
  Approved = 'approved',
  Rejected = 'rejected',
  Expired = 'expired',
  Resolved = 'resolved',
}

export enum ReturnShipping {
  None = 'none',
  Sending = 'sending',
  Delivered = 'delivered',
  Received = 'received',
}

/**
 * The RMA request — dual status: `status` is the approval lifecycle
 * (`pending_approval → approved|rejected`, `approved → resolved` once
 * inspected + refund settled — the refund settlement loop is the gate;
 * until then this service only allows `resolved` when `refundType ===
 * 'none'`), `shippingStatus` advances independently
 * (`none → sending → delivered → received`) via order-service API calls,
 * not carrier webhooks (shipping-service doesn't exist yet, §0 known gap).
 *
 * `customerId` is a plain text column — crm-service doesn't exist yet
 * (§0 known gap). `order` is a real same-DB FK (`nullable: false` explicit
 * — repo rule).
 *
 * Extends `BaseEntity` (id + manual `storeId`), not `TenantScopedEntity` —
 * §9's DDL has no `created_at`/`updated_at` for this table (`requestedAt`
 * is the effective creation timestamp; the row's lifecycle is tracked by
 * the four explicit `*_at` columns below, not a generic `updated_at`).
 */
@Entity('return_request')
@Unique(['storeId', 'displayId'])
export class ReturnRequest extends BaseEntity {
  @Index()
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @Column({ type: 'text', name: 'display_id' })
  displayId!: string;

  @Index()
  @ManyToOne(() => Order, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  /** Opaque reference — crm-service doesn't exist yet (§0 known gap). */
  @Column({ type: 'text', name: 'customer_id', nullable: true })
  customerId?: string | null;

  @Column({
    type: 'enum',
    enum: ReturnStatus,
    enumName: 'return_status',
    default: ReturnStatus.PendingApproval,
  })
  status!: ReturnStatus;

  @Column({
    type: 'enum',
    enum: ReturnShipping,
    enumName: 'return_shipping',
    name: 'shipping_status',
    default: ReturnShipping.None,
  })
  shippingStatus!: ReturnShipping;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ type: 'timestamptz', name: 'requested_at', default: () => 'now()' })
  requestedAt!: Date;

  @Column({ type: 'timestamptz', name: 'approved_at', nullable: true })
  approvedAt?: Date | null;

  @Column({ type: 'timestamptz', name: 'rejected_at', nullable: true })
  rejectedAt?: Date | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt?: Date | null;

  /** `now() + RMA_EXPIRY_DAYS` at creation — the delayed-message expiry handler flips `status` to `expired` at this instant if still `pending_approval`. */
  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'boolean', default: false })
  inspected!: boolean;

  @Column({ type: 'text', nullable: true })
  note?: string | null;
}
