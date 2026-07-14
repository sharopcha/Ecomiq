/**
 * Runnable proof — boots the real
 * Nest application context (real `OrdersService`, `ReturnsService`,
 * Postgres via `order_db`) and exercises the full legal RMA path, every
 * illegal transition, and the auto-expiry handler, same "drive the real
 * services" pattern as `orders-demo.ts`.
 *
 * Run:
 *   npm run order:returns-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { OrdersService } from '../app/orders/orders.service';
import { ReturnsService } from '../app/returns/returns.service';
import { OrderLine } from '../app/entities/order-line.entity';
import { OrderStatus } from '../app/entities/order.entity';
import { ReturnShipping, ReturnStatus } from '../app/entities/return-request.entity';
import { RefundType } from '../app/entities/refund.entity';
import { OrderEventType } from '../app/events/order-event-types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[returns-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${Date.now()}`;

  const orders = app.get(OrdersService);
  const returns = app.get(ReturnsService);
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));
  const orderLineRepo = app.get<Repository<OrderLine>>(getRepositoryToken(OrderLine));

  async function firstLineIdFor(orderId: string): Promise<string> {
    const line = await orderLineRepo.findOne({ where: { order: { id: orderId } } });
    return (line as OrderLine).id;
  }

  console.log('[returns-demo] creating a confirmed order to return against...');
  const order = await orders.create(storeId, {
    status: OrderStatus.Open,
    lines: [{ variantId: 'variant_1', name: 'Blue Hoodie', qty: 2, unitPriceMinor: 3000 }],
  });
  const orderLineId = await firstLineIdFor(order.id);

  console.log('[returns-demo] requesting an RMA for 1 unit...');
  const rma = await returns.create(storeId, {
    orderId: order.id,
    lines: [{ orderLineId, qty: 1 }],
    reason: 'Wrong size',
  });
  assert(rma.displayId.startsWith('RMA-'), `expected an RMA- displayId, got ${rma.displayId}`);
  assert(rma.status === ReturnStatus.PendingApproval, `expected pending_approval, got ${rma.status}`);
  const requestedOutbox = await outboxRepo.count({
    where: { aggregateId: rma.id, eventType: OrderEventType.ReturnRequested },
  });
  assert(requestedOutbox === 1, `expected 1 orders.return.requested outbox row, got ${requestedOutbox}`);
  const expiryOutbox = await outboxRepo.count({
    where: { aggregateId: rma.id, eventType: OrderEventType.ReturnExpiryCheck },
  });
  assert(expiryOutbox === 1, `expected 1 delayed expiry-check outbox row, got ${expiryOutbox}`);
  console.log('[returns-demo] OK — RMA requested, outbox rows correct.');

  console.log('[returns-demo] illegal: resolving before approval...');
  try {
    await returns.resolve(storeId, rma.id, RefundType.None);
    throw new Error('expected resolving a pending RMA to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'ConflictException', 'expected a ConflictException');
    console.log('[returns-demo] OK — resolve-before-approval rejected.');
  }

  console.log('[returns-demo] approving...');
  const approved = await returns.approve(storeId, rma.id);
  assert(approved.status === ReturnStatus.Approved, `expected approved, got ${approved.status}`);

  console.log('[returns-demo] illegal: approving again...');
  try {
    await returns.approve(storeId, rma.id);
    throw new Error('expected re-approving to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'ConflictException', 'expected a ConflictException');
    console.log('[returns-demo] OK — double-approve rejected.');
  }

  console.log('[returns-demo] illegal: resolving before inspection...');
  try {
    await returns.resolve(storeId, rma.id, RefundType.None);
    throw new Error('expected resolving an uninspected RMA to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'ConflictException', 'expected a ConflictException');
    console.log('[returns-demo] OK — resolve-before-inspection rejected.');
  }

  console.log('[returns-demo] illegal: resolving with a refundType other than none...');
  await returns.inspect(storeId, rma.id);
  try {
    await returns.resolve(storeId, rma.id, RefundType.Full);
    throw new Error('expected resolving with refundType=full to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'BadRequestException', 'expected a BadRequestException');
    console.log('[returns-demo] OK — refundType=full rejected (no settled refund exists for this RMA yet — the refund-settlement gate).');
  }

  console.log('[returns-demo] resolving with refundType=none (legal)...');
  const resolved = await returns.resolve(storeId, rma.id, RefundType.None);
  assert(resolved.status === ReturnStatus.Resolved, `expected resolved, got ${resolved.status}`);
  console.log('[returns-demo] OK — resolved.');

  console.log('[returns-demo] advancing shipping status through its full sequence...');
  let shipping = await returns.findOne(storeId, rma.id);
  assert(shipping.shippingStatus === ReturnShipping.None, 'expected shipping status to start at none');
  for (const expected of [ReturnShipping.Sending, ReturnShipping.Delivered, ReturnShipping.Received]) {
    shipping = await returns.advanceShippingStatus(storeId, rma.id);
    assert(shipping.shippingStatus === expected, `expected shipping status ${expected}, got ${shipping.shippingStatus}`);
  }
  try {
    await returns.advanceShippingStatus(storeId, rma.id);
    throw new Error('expected advancing past received to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'ConflictException', 'expected a ConflictException');
  }
  console.log('[returns-demo] OK — shipping status advanced none -> sending -> delivered -> received, then correctly refused further advance.');

  console.log('[returns-demo] auto-expiry: creating a second RMA and expiring it while still pending...');
  const order2 = await orders.create(storeId, {
    status: OrderStatus.Open,
    lines: [{ variantId: 'variant_2', name: 'Red Cap', qty: 1, unitPriceMinor: 1500 }],
  });
  const orderLine2Id = await firstLineIdFor(order2.id);
  const rma2 = await returns.create(storeId, { orderId: order2.id, lines: [{ orderLineId: orderLine2Id, qty: 1 }] });
  await returns.expire(storeId, rma2.id);
  const expired = await returns.findOne(storeId, rma2.id);
  assert(expired.status === ReturnStatus.Expired, `expected expired, got ${expired.status}`);
  console.log('[returns-demo] OK — pending RMA flipped to expired.');

  console.log('[returns-demo] auto-expiry idempotency: expiring the already-resolved RMA #1 is a silent no-op...');
  await returns.expire(storeId, rma.id);
  const stillResolved = await returns.findOne(storeId, rma.id);
  assert(stillResolved.status === ReturnStatus.Resolved, 'expiring an already-resolved RMA must not change its status');
  console.log('[returns-demo] OK — expire() left the resolved RMA untouched.');

  console.log('[returns-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[returns-demo] FAILED:', err);
  process.exit(1);
});
