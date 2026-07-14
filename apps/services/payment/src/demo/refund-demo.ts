/**
 * Runnable proof — boots the real Nest application context (real
 * `RefundsService`, `MockPaymentProvider`,
 * Postgres via `payment_db`) and exercises the full refund-execution flow
 * directly against the service layer, same "drive the real services"
 * pattern as `intents-demo.ts`. `NestFactory.createApplicationContext`
 * does *not* run `main.ts`'s imperative `connectMicroservice`/
 * `startAllMicroservices` calls (those aren't wired via any module's
 * lifecycle hook), so this never opens a real Pulsar consumer — the
 * consumer wiring itself (subscribing to `payment.commands` and
 * dispatching via `RefundCommandsController`) is what the user-side smoke
 * test (publishing a real command onto live Pulsar) proves instead.
 *
 * Run:
 *   npm run payment:refund-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { PaymentsService } from '../app/payments/payments.service';
import { RefundsService } from '../app/refunds/refunds.service';
import { Payment, PaymentStatus } from '../app/entities/payment.entity';
import { RefundExecution, RefundExecutionStatus } from '../app/entities/refund-execution.entity';
import { PaymentEventType } from '../app/events/payment-event-types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[refund-demo] ASSERTION FAILED: ${message}`);
  }
}

/** Fast-forwards a fresh intent straight to `paid`, bypassing the webhook flow — the webhook demo already proves that path separately. */
async function createPaidPayment(
  payments: PaymentsService,
  paymentRepo: Repository<Payment>,
  storeId: string,
  orderId: string,
  amountMinor: number,
): Promise<Payment> {
  const { payment } = await payments.createIntent(storeId, { orderId, amountMinor, currency: 'USD' });
  payment.status = PaymentStatus.Paid;
  return paymentRepo.save(payment);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;

  const payments = app.get(PaymentsService);
  const refunds = app.get(RefundsService);
  const paymentRepo = app.get<Repository<Payment>>(getRepositoryToken(Payment));
  const refundExecutionRepo = app.get<Repository<RefundExecution>>(getRepositoryToken(RefundExecution));
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));

  // ── Full refund → status rolls up to `refunded` ─────────────────────────
  console.log('[refund-demo] creating a paid payment (2000 minor units)...');
  const fullPayment = await createPaidPayment(payments, paymentRepo, storeId, `demo-order-${ulid()}`, 2000);

  console.log('[refund-demo] executing a full refund...');
  const fullRefundId = `demo-refund-${ulid()}`;
  await refunds.executeRefund({
    refundId: fullRefundId,
    orderId: fullPayment.orderId,
    paymentId: fullPayment.id,
    storeId,
    amountMinor: 2000,
    reason: 'customer requested',
  });

  const fullRefundExecution = await refundExecutionRepo.findOneBy({ idempotencyKey: fullRefundId });
  assert(!!fullRefundExecution, 'RefundExecution row should exist');
  assert(fullRefundExecution!.status === RefundExecutionStatus.Succeeded, 'refund should succeed');

  const succeededOutboxCount = await outboxRepo.count({
    where: { aggregateId: fullPayment.id, eventType: PaymentEventType.RefundSucceeded },
  });
  assert(succeededOutboxCount === 1, `expected 1 payments.refund.succeeded outbox row, got ${succeededOutboxCount}`);

  const rolledUpPayment = await paymentRepo.findOneByOrFail({ id: fullPayment.id });
  assert(rolledUpPayment.status === PaymentStatus.Refunded, `expected status refunded, got ${rolledUpPayment.status}`);
  console.log('[refund-demo] OK — full refund succeeded, status rolled up to refunded, 1 outbox row.');

  console.log('[refund-demo] replaying the same refund command...');
  await refunds.executeRefund({
    refundId: fullRefundId,
    orderId: fullPayment.orderId,
    paymentId: fullPayment.id,
    storeId,
    amountMinor: 2000,
    reason: 'customer requested',
  });
  const refundExecutionCountAfterReplay = await refundExecutionRepo.count({
    where: { idempotencyKey: fullRefundId },
  });
  assert(refundExecutionCountAfterReplay === 1, 'replay must not create a second RefundExecution row');
  const outboxCountAfterReplay = await outboxRepo.count({
    where: { aggregateId: fullPayment.id, eventType: PaymentEventType.RefundSucceeded },
  });
  assert(outboxCountAfterReplay === 1, 'replay must not create a second outbox row');
  console.log('[refund-demo] OK — replay was a no-op, no duplicate rows.');

  // ── Partial refund → status rolls up to `partially_refunded` ────────────
  console.log('[refund-demo] creating a second paid payment (3000 minor units) for a partial refund...');
  const partialPayment = await createPaidPayment(payments, paymentRepo, storeId, `demo-order-${ulid()}`, 3000);
  await refunds.executeRefund({
    refundId: `demo-refund-${ulid()}`,
    orderId: partialPayment.orderId,
    paymentId: partialPayment.id,
    storeId,
    amountMinor: 1000,
  });
  const partiallyRolledUp = await paymentRepo.findOneByOrFail({ id: partialPayment.id });
  assert(
    partiallyRolledUp.status === PaymentStatus.PartiallyRefunded,
    `expected partially_refunded, got ${partiallyRolledUp.status}`,
  );
  console.log('[refund-demo] OK — partial refund rolled up to partially_refunded.');

  // ── Deterministic failure (amount ends in 99) ────────────────────────────
  console.log('[refund-demo] creating a third paid payment (1099 minor units) for a deterministic failure...');
  const failPayment = await createPaidPayment(payments, paymentRepo, storeId, `demo-order-${ulid()}`, 1099);
  await refunds.executeRefund({
    refundId: `demo-refund-${ulid()}`,
    orderId: failPayment.orderId,
    paymentId: failPayment.id,
    storeId,
    amountMinor: 1099,
  });
  const failedExecutions = await refundExecutionRepo.find({ where: { orderId: failPayment.orderId } });
  assert(failedExecutions.length === 1, 'expected exactly one RefundExecution for the failing refund');
  assert(failedExecutions[0].status === RefundExecutionStatus.Failed, 'refund of an amount ending in 99 should fail');
  const stillPaid = await paymentRepo.findOneByOrFail({ id: failPayment.id });
  assert(stillPaid.status === PaymentStatus.Paid, 'a failed refund must not change the payment status');
  console.log('[refund-demo] OK — amount ending in 99 failed deterministically, payment status unchanged.');

  // ── Async settlement path (webhook confirmation) ─────────────────────────
  console.log('[refund-demo] exercising the async settlement path (settleRefundByProviderRef)...');
  const asyncPayment = await createPaidPayment(payments, paymentRepo, storeId, `demo-order-${ulid()}`, 1500);
  const pendingProviderRef = `mock_re_pending_${ulid()}`;
  const pendingExecution = refundExecutionRepo.create({
    storeId,
    payment: asyncPayment,
    refundId: `demo-refund-${ulid()}`,
    orderId: asyncPayment.orderId,
    amountMinor: 1500,
    status: RefundExecutionStatus.Processing,
    providerRef: pendingProviderRef,
    idempotencyKey: `demo-refund-async-${ulid()}`,
  });
  await refundExecutionRepo.save(pendingExecution);

  await refunds.settleRefundByProviderRef(pendingProviderRef, 'succeeded');
  const settled = await refundExecutionRepo.findOneByOrFail({ providerRef: pendingProviderRef });
  assert(settled.status === RefundExecutionStatus.Succeeded, 'async settlement should flip status to succeeded');
  const asyncRolledUp = await paymentRepo.findOneByOrFail({ id: asyncPayment.id });
  assert(asyncRolledUp.status === PaymentStatus.Refunded, 'async settlement should also roll up the payment status');
  console.log('[refund-demo] OK — async settlement path applied the transition + rollup correctly.');

  console.log('[refund-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[refund-demo] FAILED:', err);
  process.exit(1);
});
