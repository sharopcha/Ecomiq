import { Column, Entity, Index, JoinColumn, ManyToOne, UpdateDateColumn } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';
import { Order } from './order.entity';

export enum SagaType {
  Checkout = 'checkout',
  Refund = 'refund',
}

export enum SagaStatus {
  Running = 'running',
  Compensating = 'compensating',
  Completed = 'completed',
  Failed = 'failed',
}

/**
 * The checkout/refund saga orchestrator's durable memory — a genuinely new
 * table, not from the original monolith-era data model (sagas are a
 * microservices-era concept ADR-7 introduces). Every orchestrator
 * transition loads the current row, performs exactly one side effect, and
 * persists the new `step`/`status` in the same transaction as any outbox
 * event — this row *is* the crash-recovery mechanism: on boot, the
 * orchestrator resumes any `running` saga older than a threshold by
 * re-executing its current step.
 *
 * `order` is a real same-DB FK (`nullable: false` explicit) — a saga
 * always operates against an order that already exists (checkout starts
 * from an already-created `open` order; the refund saga starts from an
 * existing refund request).
 *
 * `step` is a plain text column, not an enum — the exact set of step names
 * (`validating_discount`, `reserving_stock`, ...) is the checkout saga's
 * concern and will grow without needing a schema migration each time a
 * step is renamed/added, unlike `status`, which is a small, stable,
 * orchestration-level state machine.
 */
@Entity('saga_state')
export class SagaState extends BaseEntity {
  @Index()
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @Index()
  @ManyToOne(() => Order, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({
    type: 'enum',
    enum: SagaType,
    enumName: 'saga_type',
    name: 'saga_type',
  })
  sagaType!: SagaType;

  @Column({ type: 'text' })
  step!: string;

  @Column({
    type: 'enum',
    enum: SagaStatus,
    enumName: 'saga_status',
    default: SagaStatus.Running,
  })
  status!: SagaStatus;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'started_at', default: () => 'now()' })
  startedAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  /** Set when entering a step with a timeout (e.g. `awaiting_payment`) — the delayed-message handler checks this before compensating, so a resumed/late saga doesn't get compensated twice. */
  @Column({ type: 'timestamptz', name: 'timeout_at', nullable: true })
  timeoutAt?: Date | null;
}
