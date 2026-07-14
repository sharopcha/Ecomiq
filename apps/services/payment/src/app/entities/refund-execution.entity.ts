import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MoneyTransformer, TenantScopedEntity } from '@temp-nx/typeorm';
import { Payment } from './payment.entity';

export enum RefundExecutionStatus {
  Processing = 'processing',
  Succeeded = 'succeeded',
  Failed = 'failed',
}

/**
 * The *execution* of a refund (via a command-topic design): order-service
 * owns the refund *request* (its own `refund` table, `refund_status` enum
 * — a different entity in a different database); this row is
 * payment-service's record of actually carrying that request out via the
 * bound `PaymentProviderPort`.
 *
 * - `paymentId` is a real same-DB `@ManyToOne` (`nullable: false` explicit —
 *   repo rule: TypeORM's `@ManyToOne` join columns default to
 *   `nullable: true` regardless of the TS type, so hand-written migrations
 *   must match a real `synchronize` run, not the TS type's optionality).
 * - `refundId`/`orderId` are plain text columns, not relations — they
 *   reference order-service's own tables, which live in a different
 *   database (ADR-2). `refundId` is the order-service refund row's id;
 *   `idempotencyKey` (below) is set to that same value by the command
 *   handler, so replaying the same `payments.refund.execute` command is a
 *   no-op rather than a double-refund.
 */
@Entity('refund_execution')
export class RefundExecution extends TenantScopedEntity {
  @Index()
  @ManyToOne(() => Payment, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payment_id' })
  payment!: Payment;

  /** order-service's refund request row id — see class doc comment. */
  @Index()
  @Column({ type: 'text', name: 'refund_id' })
  refundId!: string;

  /** order-service's order id — plain text, no FK (ADR-2). */
  @Column({ type: 'text', name: 'order_id' })
  orderId!: string;

  @Column({
    type: 'bigint',
    name: 'amount_minor',
    transformer: MoneyTransformer,
  })
  amountMinor!: number;

  @Column({
    type: 'enum',
    enum: RefundExecutionStatus,
    enumName: 'refund_execution_status',
    default: RefundExecutionStatus.Processing,
  })
  status!: RefundExecutionStatus;

  /** The provider's own refund id (Stripe's `re_...`, mock's analog), once known. */
  @Column({ type: 'text', name: 'provider_ref', nullable: true })
  providerRef?: string | null;

  @Column({ type: 'text', name: 'failure_reason', nullable: true })
  failureReason?: string | null;

  /** Set to the incoming command's `refundId` — makes replaying the same `payments.refund.execute` command idempotent. Unique but nullable. */
  @Index({ unique: true })
  @Column({ type: 'text', name: 'idempotency_key', nullable: true })
  idempotencyKey?: string | null;
}
