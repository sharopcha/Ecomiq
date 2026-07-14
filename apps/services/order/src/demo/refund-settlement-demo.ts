/**
 * Runnable proof — boots the real
 * Nest application context (real Postgres via `order_db`) and drives
 * `RefundsService.handleRefundSucceeded`/`.handleRefundFailed` directly
 * with synthetic payloads — payment-service's real events don't need to
 * physically exist for this proof, same substitution the checkout-saga
 * and refunds demos use for the same reason. The real
 * cross-service wiring (the command actually reaching payment-service,
 * executing, and its event actually reaching back) was already proven
 * live in the checkout smoke test; this demo is about the settlement logic
 * itself: rollup correctness, RMA closure, the failure path.
 *
 * Run:
 *   npm run order:refund-settlement-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { OrdersService } from '../app/orders/orders.service';
import { ReturnsService } from '../app/returns/returns.service';
import { RefundsService } from '../app/refunds/refunds.service';
import { Order, OrderPaymentStatus, OrderStatus } from '../app/entities/order.entity';
import { OrderLine } from '../app/entities/order-line.entity';
import { ReturnStatus } from '../app/entities/return-request.entity';
import { RefundStatus, RefundType } from '../app/entities/refund.entity';
import { OrderEventType } from '../app/events/order-event-types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[refund-settlement-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${Date.now()}`;

  const orders = app.get(OrdersService);
  const returns = app.get(ReturnsService);
  const refunds = app.get(RefundsService);
  const orderRepo = app.get<Repository<Order>>(getRepositoryToken(Order));
  const orderLineRepo = app.get<Repository<OrderLine>>(getRepositoryToken(OrderLine));
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));

  console.log('[refund-settlement-demo] full legal path: paid order -> RMA -> refund -> settled -> RMA resolved...');
  {
    const order = await orders.create(storeId, {
      status: OrderStatus.Open,
      lines: [{ variantId: 'variant_1', name: 'Settlement Test Item', qty: 1, unitPriceMinor: 8000 }],
    });
    order.paymentId = 'pay_settle_1';
    order.paymentStatus = OrderPaymentStatus.Paid;
    await orderRepo.save(order);

    const line = await orderLineRepo.findOneByOrFail({ order: { id: order.id } } as never);
    const rma = await returns.create(storeId, { orderId: order.id, lines: [{ orderLineId: line.id, qty: 1 }] });
    await returns.approve(storeId, rma.id);
    await returns.inspect(storeId, rma.id);

    const refund = await refunds.create(storeId, order.id, {
      returnId: rma.id,
      refundType: RefundType.Full,
      amountMinor: 8000,
    });
    await refunds.approve(storeId, refund.id);

    console.log('[refund-settlement-demo] simulating payments.refund.succeeded...');
    await refunds.handleRefundSucceeded(refund.id);

    const settledRefund = await refunds.findOne(storeId, refund.id);
    assert(settledRefund.status === RefundStatus.Refunded, `expected refunded, got ${settledRefund.status}`);
    assert(!!settledRefund.refundedAt, 'expected refundedAt to be set');

    const updatedOrder = await orderRepo.findOneByOrFail({ id: order.id });
    assert(
      updatedOrder.paymentStatus === OrderPaymentStatus.Refunded,
      `expected order paymentStatus refunded, got ${updatedOrder.paymentStatus}`,
    );

    const resolvedRma = await returns.findOne(storeId, rma.id);
    assert(resolvedRma.status === ReturnStatus.Resolved, `expected RMA resolved, got ${resolvedRma.status}`);

    const settledOutbox = await outboxRepo.count({
      where: { aggregateId: refund.id, eventType: OrderEventType.RefundSettled },
    });
    assert(settledOutbox === 1, `expected 1 orders.refund.settled outbox row, got ${settledOutbox}`);
    const notifyOutbox = await outboxRepo.findOne({ where: { aggregateId: refund.id, eventType: 'notify.send' } });
    assert(!!notifyOutbox, 'expected a notify.send command row');
    assert(
      notifyOutbox?.topic === 'persistent://ecomiq/marketing/notify.commands',
      `expected the notify.send topic override to target marketing's command topic, got ${notifyOutbox?.topic}`,
    );

    console.log('[refund-settlement-demo] duplicate payments.refund.succeeded delivery is a no-op...');
    await refunds.handleRefundSucceeded(refund.id);
    const notifyOutboxAfterReplay = await outboxRepo.count({
      where: { aggregateId: refund.id, eventType: 'notify.send' },
    });
    assert(notifyOutboxAfterReplay === 1, 'a duplicate payments.refund.succeeded delivery must not send a second notify.send command');

    console.log('[refund-settlement-demo] OK — refund refunded, order rollup correct, RMA resolved, notify.send command present, duplicate delivery ignored.');
  }

  console.log('[refund-settlement-demo] failure path: refund stuck processing, RMA stays open, staff alert present...');
  {
    const order = await orders.create(storeId, {
      status: OrderStatus.Open,
      lines: [{ variantId: 'variant_2', name: 'Settlement Failure Item', qty: 1, unitPriceMinor: 5000 }],
    });
    order.paymentId = 'pay_settle_2';
    order.paymentStatus = OrderPaymentStatus.Paid;
    await orderRepo.save(order);

    const line = await orderLineRepo.findOneByOrFail({ order: { id: order.id } } as never);
    const rma = await returns.create(storeId, { orderId: order.id, lines: [{ orderLineId: line.id, qty: 1 }] });
    await returns.approve(storeId, rma.id);
    await returns.inspect(storeId, rma.id);

    const refund = await refunds.create(storeId, order.id, {
      returnId: rma.id,
      refundType: RefundType.Full,
      amountMinor: 5000,
    });
    await refunds.approve(storeId, refund.id);

    console.log('[refund-settlement-demo] simulating payments.refund.failed...');
    await refunds.handleRefundFailed(refund.id, 'provider declined the refund');

    const failedRefund = await refunds.findOne(storeId, refund.id);
    assert(failedRefund.status === RefundStatus.Processing, `expected refund to stay processing, got ${failedRefund.status}`);
    assert(failedRefund.failureReason === 'provider declined the refund', 'expected the failure reason to be surfaced');

    const openRma = await returns.findOne(storeId, rma.id);
    assert(openRma.status === ReturnStatus.Approved, `expected RMA to stay approved (open), got ${openRma.status}`);

    const staffAlert = await outboxRepo.findOne({
      where: { aggregateId: refund.id, eventType: 'notify.send' },
    });
    assert(!!staffAlert, 'expected a notify.send staff-alert command row');

    const unchangedOrder = await orderRepo.findOneByOrFail({ id: order.id });
    assert(
      unchangedOrder.paymentStatus === OrderPaymentStatus.Paid,
      `expected order paymentStatus to stay paid (no rollup on failure), got ${unchangedOrder.paymentStatus}`,
    );

    console.log('[refund-settlement-demo] OK — refund stuck processing, RMA stays open, staff alert present, no order rollup.');
  }

  console.log('[refund-settlement-demo] partial-refund rollup shows partially_refunded...');
  {
    const order = await orders.create(storeId, {
      status: OrderStatus.Open,
      lines: [{ variantId: 'variant_3', name: 'Partial Rollup Item', qty: 1, unitPriceMinor: 10000 }],
    });
    order.paymentId = 'pay_settle_3';
    order.paymentStatus = OrderPaymentStatus.Paid;
    await orderRepo.save(order);

    const refund = await refunds.create(storeId, order.id, { refundType: RefundType.Partial, amountMinor: 4000 });
    await refunds.approve(storeId, refund.id);
    await refunds.handleRefundSucceeded(refund.id);

    const updatedOrder = await orderRepo.findOneByOrFail({ id: order.id });
    assert(
      updatedOrder.paymentStatus === OrderPaymentStatus.PartiallyRefunded,
      `expected partially_refunded, got ${updatedOrder.paymentStatus}`,
    );
    console.log('[refund-settlement-demo] OK — partial refund rolled up to partially_refunded.');
  }

  console.log('[refund-settlement-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[refund-settlement-demo] FAILED:', err);
  process.exit(1);
});
