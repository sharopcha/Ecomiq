import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity, MoneyTransformer } from '@temp-nx/typeorm';
import { Order } from './order.entity';
import { ReturnRequest } from './return-request.entity';

export enum RefundType {
  Full = 'full',
  Partial = 'partial',
  None = 'none',
}

export enum RefundStatus {
  Requested = 'requested',
  Processing = 'processing',
  Refunded = 'refunded',
  Declined = 'declined',
  NotRefunded = 'not_refunded',
}

/**
 * order-service's refund *request* — payment-service's `RefundExecution`
 * is the *execution* of one of these
 * once approved; this row is created here, not there (order-service owns
 * the request, payment-service only carries it out — see
 * `RefundExecution`'s doc comment for the other half of this split).
 *
 * `returnRequest` is optional (a goodwill refund can exist with no RMA
 * behind it) and a real same-DB FK when set. `paymentId` is a plain text
 * column — **not** a real FK the way the original monolith DDL had it
 * (`payment_id text REFERENCES payment(id)`): payment now lives in its own
 * database (ADR-2), so this is a snapshot reference resolved once
 * `payments.payment.succeeded` sets it on the order, same cross-service
 * convention as every other plain-text id in this repo.
 *
 * Amount rule (data-model rule 4, enforced in the service layer, not
 * here): cumulative refunds must never exceed the order total minus prior
 * refunds; `refundType: 'none'` implies `amountMinor: 0`.
 */
@Entity('refund')
export class Refund extends BaseEntity {
  @Index()
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @Index()
  @ManyToOne(() => ReturnRequest, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'return_id' })
  returnRequest?: ReturnRequest | null;

  @Index()
  @ManyToOne(() => Order, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  /** payment-service's `Payment.id` — plain text, no FK (ADR-2). See class doc comment. */
  @Column({ type: 'text', name: 'payment_id', nullable: true })
  paymentId?: string | null;

  @Column({
    type: 'enum',
    enum: RefundType,
    enumName: 'refund_type',
    name: 'refund_type',
  })
  refundType!: RefundType;

  @Column({ type: 'bigint', name: 'amount_minor', default: 0, transformer: MoneyTransformer })
  amountMinor!: number;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ type: 'text', name: 'message_to_customer', nullable: true })
  messageToCustomer?: string | null;

  @Column({ type: 'boolean', name: 'send_info_to_customer', default: true })
  sendInfoToCustomer!: boolean;

  @Column({
    type: 'enum',
    enum: RefundStatus,
    enumName: 'refund_status',
    default: RefundStatus.Requested,
  })
  status!: RefundStatus;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'refunded_at', nullable: true })
  refundedAt?: Date | null;

  /**
   * Set when `payments.refund.failed` lands — surfaces *why*
   * execution failed while the refund stays `processing` (data-model rule
   * 4 doesn't have a "failed" status distinct from `not_refunded`; this
   * repo keeps the refund `processing` with the reason visible rather than
   * introducing a new terminal status, since a provider failure here is
   * usually retryable/actionable by staff, not necessarily final). Added
   * in a later migration than the rest of this entity — nothing wrote
   * here until the settlement consumer existed.
   */
  @Column({ type: 'text', name: 'failure_reason', nullable: true })
  failureReason?: string | null;
}
