/**
 * Runnable proof — boots the real
 * Nest application context (real `OrdersService`/`RefundsService`, Postgres
 * via `order_db`) and exercises: request → approve (command row in the
 * outbox, targeted at payment-service's command topic) → decline path →
 * over-amount rejected → cumulative partial refunds.
 *
 * Run:
 *   npm run order:refunds-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { OrdersService } from '../app/orders/orders.service';
import { RefundsService } from '../app/refunds/refunds.service';
import { Order, OrderStatus } from '../app/entities/order.entity';
import { RefundStatus, RefundType } from '../app/entities/refund.entity';
import { OrderEventType } from '../app/events/order-event-types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[refunds-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${Date.now()}`;

  const orders = app.get(OrdersService);
  const refunds = app.get(RefundsService);
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));
  const orderRepo = app.get<Repository<Order>>(getRepositoryToken(Order));

  console.log('[refunds-demo] creating a paid order (totalMinor=10000)...');
  const order = await orders.create(storeId, {
    status: OrderStatus.Open,
    lines: [{ variantId: 'variant_1', name: 'Refund Test Item', qty: 1, unitPriceMinor: 10000 }],
  });
  // Simulate a succeeded payment without running the full checkout saga —
  // this demo is about RefundsService, not the saga (already proven in
  // the checkout demo). Directly stamping paymentId is the same shortcut
  // the refund-settlement demo needs too.
  order.paymentId = 'pay_demo_1';
  await orderRepo.save(order);

  console.log('[refunds-demo] requesting a partial refund (4000 of 10000)...');
  const refund1 = await refunds.create(storeId, order.id, { refundType: RefundType.Partial, amountMinor: 4000 });
  assert(refund1.status === RefundStatus.Requested, `expected requested, got ${refund1.status}`);
  const requestedOutbox = await outboxRepo.count({
    where: { aggregateId: refund1.id, eventType: OrderEventType.RefundRequested },
  });
  assert(requestedOutbox === 1, `expected 1 orders.refund.requested outbox row, got ${requestedOutbox}`);

  console.log('[refunds-demo] approving it — expect a command row targeted at payment-service\'s topic...');
  const approved = await refunds.approve(storeId, refund1.id);
  assert(approved.status === RefundStatus.Processing, `expected processing, got ${approved.status}`);
  const commandRow = await outboxRepo.findOne({ where: { aggregateId: refund1.id, eventType: 'payments.refund.execute' } });
  assert(!!commandRow, 'expected a payments.refund.execute command row in the outbox');
  assert(
    commandRow?.topic === 'persistent://ecomiq/payments/payment.commands',
    `expected the command row's topic override to target payment-service's command topic, got ${commandRow?.topic}`,
  );
  console.log(`[refunds-demo] OK — command row topic override: ${commandRow?.topic}`);

  console.log('[refunds-demo] illegal: approving an already-processing refund...');
  try {
    await refunds.approve(storeId, refund1.id);
    throw new Error('expected re-approving to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'ConflictException', 'expected a ConflictException');
    console.log('[refunds-demo] OK — double-approve rejected.');
  }

  console.log('[refunds-demo] requesting a second partial refund for the remaining 6000...');
  const refund2 = await refunds.create(storeId, order.id, { refundType: RefundType.Partial, amountMinor: 6000 });
  assert(refund2.status === RefundStatus.Requested, `expected requested, got ${refund2.status}`);

  console.log('[refunds-demo] illegal: requesting a third refund that would exceed the order total...');
  try {
    await refunds.create(storeId, order.id, { refundType: RefundType.Partial, amountMinor: 1 });
    throw new Error('expected an over-amount refund to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'BadRequestException', 'expected a BadRequestException');
    console.log('[refunds-demo] OK — over-amount refund rejected (cumulative check against prior non-declined refunds).');
  }

  console.log('[refunds-demo] declining the second refund...');
  const declined = await refunds.decline(storeId, refund2.id, 'customer withdrew the request');
  assert(declined.status === RefundStatus.Declined, `expected declined, got ${declined.status}`);
  const declinedOutbox = await outboxRepo.count({
    where: { aggregateId: refund2.id, eventType: OrderEventType.RefundDeclined },
  });
  assert(declinedOutbox === 1, `expected 1 orders.refund.declined outbox row, got ${declinedOutbox}`);
  console.log('[refunds-demo] OK — declined, 1 outbox row.');

  console.log('[refunds-demo] a declined refund no longer counts toward the cumulative total — requesting 6000 again should succeed...');
  const refund3 = await refunds.create(storeId, order.id, { refundType: RefundType.Partial, amountMinor: 6000 });
  assert(refund3.status === RefundStatus.Requested, `expected requested, got ${refund3.status}`);
  console.log('[refunds-demo] OK — declined refunds excluded from the cumulative check.');

  console.log('[refunds-demo] refundType=none must have amountMinor=0...');
  try {
    await refunds.create(storeId, order.id, { refundType: RefundType.None, amountMinor: 1 });
    throw new Error('expected refundType=none with a non-zero amount to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'BadRequestException', 'expected a BadRequestException');
    console.log('[refunds-demo] OK — refundType=none with a non-zero amount rejected.');
  }

  console.log('[refunds-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[refunds-demo] FAILED:', err);
  process.exit(1);
});
