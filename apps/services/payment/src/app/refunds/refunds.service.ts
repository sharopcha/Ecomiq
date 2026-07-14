import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { RefundExecution, RefundExecutionStatus } from '../entities/refund-execution.entity';
import { PaymentProviderPort } from '../provider/payment-provider.port';
import { PAYMENT_AGGREGATE_TYPE, PaymentEventType } from '../events/payment-event-types';

const UNIQUE_VIOLATION = '23505';

export interface RefundExecuteCommand {
  refundId: string;
  orderId: string;
  paymentId: string;
  storeId: string;
  amountMinor: number;
  reason?: string;
}

/**
 * Executes a refund order-service has already approved —
 * `executeRefund()` is the `payments.refund.execute` command consumer's
 * entry point; `settleRefundByProviderRef()` is the webhook settlement
 * path `WebhookDispatchService` calls for `refund.*` events. Both funnel
 * into the same rollup + outbox logic.
 */
@Injectable()
export class RefundsService {
  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(RefundExecution) private readonly refundRepo: Repository<RefundExecution>,
    private readonly provider: PaymentProviderPort,
  ) {}

  /**
   * Idempotency is a pre-check (not just a race-catch) deliberately — a
   * replayed command must never call the provider a second time (harmless
   * for the stateless mock, but a real side-effecting duplicate for a live
   * provider). The unique index on `idempotency_key` is still the actual
   * race-safety backstop below (a genuinely concurrent redelivery that
   * loses the pre-check race hits the constraint violation on insert
   * instead — same two-layer pattern as inventory's
   * `Reservation.createIdempotent`).
   */
  async executeRefund(command: RefundExecuteCommand): Promise<void> {
    const existing = await this.refundRepo.findOneBy({ idempotencyKey: command.refundId });
    if (existing) return;

    const payment = await this.paymentRepo.findOneBy({ id: command.paymentId });
    if (!payment) {
      throw new NotFoundException(`No payment found for paymentId ${command.paymentId}`);
    }

    const result = payment.externalRef
      ? await this.provider.executeRefund({
          externalRef: payment.externalRef,
          amountMinor: command.amountMinor,
          reason: command.reason,
        })
      : ({
          ok: false,
          reason: 'PROVIDER_UNAVAILABLE',
          message: `Payment ${payment.id} has no externalRef to refund against`,
        } as const);

    try {
      await this.paymentRepo.manager.transaction(async (manager) => {
        const refundExecution = manager.create(RefundExecution, {
          storeId: command.storeId,
          payment,
          refundId: command.refundId,
          orderId: command.orderId,
          amountMinor: command.amountMinor,
          // `=== false` narrowing only — repo rule.
          status: result.ok === false ? RefundExecutionStatus.Failed : RefundExecutionStatus.Succeeded,
          providerRef: result.ok === false ? null : result.providerRef,
          failureReason: result.ok === false ? result.message : null,
          idempotencyKey: command.refundId,
        });
        const saved = await manager.save(refundExecution);

        if (result.ok !== false) {
          await this.rollupPaymentStatus(manager, payment.id, payment.amountMinor);
        }

        await recordOutboxEvent(manager, {
          eventType:
            result.ok === false ? PaymentEventType.RefundFailed : PaymentEventType.RefundSucceeded,
          storeId: command.storeId,
          aggregateType: PAYMENT_AGGREGATE_TYPE,
          aggregateId: payment.id,
          payload: this.toEventPayload(saved),
        });
      });
    } catch (err) {
      if (!this.isUniqueViolation(err)) throw err;
      // Lost the race against a concurrent delivery of the same command —
      // the winner's execution already recorded; this delivery is a no-op.
    }
  }

  /**
   * Async-provider settlement path: a real provider's refund can stay
   * `processing` after `executeRefund()` returns and only settle later via
   * a signed webhook, keyed by the provider's *own* refund reference (not
   * the payment's intent `externalRef`) — `WebhookDispatchService`'s
   * `refund.succeeded`/`refund.failed` branches call this. The mock
   * provider never leaves a refund `processing` (`executeRefund` always
   * resolves synchronously above), so this path is unreachable through the
   * mock end-to-end today — it exists and is verified directly (the demo
   * seeds a `processing` row and drives this method) so Stripe's
   * future slot-in needs no changes here.
   */
  async settleRefundByProviderRef(
    providerRef: string,
    outcome: 'succeeded' | 'failed',
    failureReason?: string,
  ): Promise<void> {
    await this.paymentRepo.manager.transaction(async (manager) => {
      const refundExecution = await manager
        .createQueryBuilder(RefundExecution, 're')
        .leftJoinAndSelect('re.payment', 'payment')
        .setLock('pessimistic_write', undefined, ['re'])
        .where('re.provider_ref = :providerRef', { providerRef })
        .getOne();

      if (!refundExecution) {
        throw new NotFoundException(`No refund execution found for providerRef ${providerRef}`);
      }
      if (refundExecution.status !== RefundExecutionStatus.Processing) {
        return; // already settled — idempotent no-op (duplicate webhook delivery)
      }

      const succeeded = outcome === 'succeeded';
      refundExecution.status = succeeded ? RefundExecutionStatus.Succeeded : RefundExecutionStatus.Failed;
      refundExecution.failureReason = succeeded ? null : (failureReason ?? null);
      const saved = await manager.save(refundExecution);

      if (succeeded) {
        await this.rollupPaymentStatus(manager, refundExecution.payment.id, refundExecution.payment.amountMinor);
      }

      await recordOutboxEvent(manager, {
        eventType: succeeded ? PaymentEventType.RefundSucceeded : PaymentEventType.RefundFailed,
        storeId: refundExecution.storeId,
        aggregateType: PAYMENT_AGGREGATE_TYPE,
        aggregateId: refundExecution.payment.id,
        payload: this.toEventPayload(saved),
      });
    });
  }

  /** Payment.status becomes `refunded` once cumulative succeeded refunds cover the full amount, `partially_refunded` otherwise. */
  private async rollupPaymentStatus(
    manager: EntityManager,
    paymentId: string,
    totalAmountMinor: number,
  ): Promise<void> {
    const { sum } = await manager
      .createQueryBuilder(RefundExecution, 're')
      .select('COALESCE(SUM(re.amount_minor), 0)', 'sum')
      .where('re.payment_id = :paymentId', { paymentId })
      .andWhere('re.status = :status', { status: RefundExecutionStatus.Succeeded })
      .getRawOne();

    const totalRefunded = Number(sum);
    const newStatus =
      totalRefunded >= totalAmountMinor ? PaymentStatus.Refunded : PaymentStatus.PartiallyRefunded;
    await manager.update(Payment, paymentId, { status: newStatus });
  }

  private toEventPayload(refundExecution: RefundExecution): Record<string, unknown> {
    return {
      refundId: refundExecution.refundId,
      orderId: refundExecution.orderId,
      paymentId: refundExecution.payment.id,
      amountMinor: refundExecution.amountMinor,
      status: refundExecution.status,
      providerRef: refundExecution.providerRef,
      failureReason: refundExecution.failureReason,
    };
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
    );
  }
}
