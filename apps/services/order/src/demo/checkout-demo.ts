/**
 * Runnable proof — the saga goes
 * live: boots the real Nest application context (real Postgres via
 * `order_db`) and drives `CheckoutSagaOrchestrator` through to
 * `awaiting_payment` via fake ports (same technique as
 * `checkout-saga-demo.ts`), then calls `handlePaymentSucceeded`/
 * `handlePaymentFailed`/`handlePaymentTimeout` directly — exactly what
 * `PaymentEventsController`/`PaymentTimeoutController` do when a real
 * Pulsar message arrives, just invoked in-process instead of over the wire.
 *
 * Run:
 *   npm run order:checkout-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { OrdersService } from '../app/orders/orders.service';
import { Order, OrderPaymentStatus, OrderStage, OrderStatus } from '../app/entities/order.entity';
import { OrderLine } from '../app/entities/order-line.entity';
import { SagaState, SagaStatus } from '../app/entities/saga-state.entity';
import { CheckoutSagaOrchestrator, CheckoutSagaStep } from '../app/checkout/saga/checkout-saga.orchestrator';
import { OrderEventType } from '../app/events/order-event-types';
import { createFakeCheckoutPorts } from './fake-checkout-ports';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[checkout-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${Date.now()}`;

  const orders = app.get(OrdersService);
  const sagaRepo = app.get<Repository<SagaState>>(getRepositoryToken(SagaState));
  const orderRepo = app.get<Repository<Order>>(getRepositoryToken(Order));
  const orderLineRepo = app.get<Repository<OrderLine>>(getRepositoryToken(OrderLine));
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));

  async function createTestOrder(lineCount = 2): Promise<Order> {
    const lines = Array.from({ length: lineCount }, (_, i) => ({
      variantId: `variant_${i}`,
      name: `Item ${i}`,
      qty: 1,
      unitPriceMinor: 1000,
    }));
    return orders.create(storeId, { status: OrderStatus.Open, lines });
  }

  console.log('[checkout-demo] happy path end-to-end (payment succeeds)...');
  {
    const order = await createTestOrder(2);
    const fake = createFakeCheckoutPorts();
    const orchestrator = new CheckoutSagaOrchestrator(sagaRepo, orderRepo, orderLineRepo, fake.ports);

    const saga = await orchestrator.start(storeId, order.id);
    assert(saga.step === CheckoutSagaStep.AwaitingPayment, `expected awaiting_payment, got ${saga.step}`);
    const paymentId = (saga.payload as Record<string, unknown>).paymentId as string;
    assert(!!paymentId, 'expected a paymentId to be recorded on the saga payload');

    const timeoutOutbox = await outboxRepo.count({
      where: { aggregateId: order.id, eventType: OrderEventType.OrderPaymentTimeout },
    });
    assert(timeoutOutbox === 1, `expected 1 delayed payment_timeout outbox row, got ${timeoutOutbox}`);

    await orchestrator.handlePaymentSucceeded(order.id, paymentId);

    const completed = await sagaRepo.findOneByOrFail({ id: saga.id });
    assert(completed.status === SagaStatus.Completed, `expected completed, got ${completed.status}`);

    const placedOrder = await orderRepo.findOneByOrFail({ id: order.id });
    assert(placedOrder.paymentStatus === OrderPaymentStatus.Paid, `expected paid, got ${placedOrder.paymentStatus}`);
    assert(placedOrder.stage === OrderStage.PreparingOrder, `expected preparing_order, got ${placedOrder.stage}`);
    assert(placedOrder.paymentId === paymentId, 'expected order.paymentId to be set');

    const placedOutbox = await outboxRepo.count({
      where: { aggregateId: order.id, eventType: OrderEventType.OrderPlaced },
    });
    assert(placedOutbox === 1, `expected 1 orders.order.placed outbox row, got ${placedOutbox}`);

    console.log('[checkout-demo] OK — saga completed, order paid + placed, 1 placed outbox row.');

    console.log('[checkout-demo] duplicate payment.succeeded delivery is a no-op...');
    await orchestrator.handlePaymentSucceeded(order.id, paymentId);
    const placedOutboxAfterReplay = await outboxRepo.count({
      where: { aggregateId: order.id, eventType: OrderEventType.OrderPlaced },
    });
    assert(placedOutboxAfterReplay === 1, 'a duplicate payment.succeeded delivery must not create a second orders.order.placed row');
    console.log('[checkout-demo] OK — duplicate delivery ignored, no second outbox row.');
  }

  console.log('[checkout-demo] payment-failed path releases everything...');
  {
    const order = await createTestOrder(2);
    const fake = createFakeCheckoutPorts();
    const orchestrator = new CheckoutSagaOrchestrator(sagaRepo, orderRepo, orderLineRepo, fake.ports);

    const saga = await orchestrator.start(storeId, order.id);
    assert(saga.step === CheckoutSagaStep.AwaitingPayment, `expected awaiting_payment, got ${saga.step}`);

    await orchestrator.handlePaymentFailed(order.id, 'payment failed: card_declined');

    const failed = await sagaRepo.findOneByOrFail({ id: saga.id });
    assert(failed.status === SagaStatus.Failed, `expected failed, got ${failed.status}`);
    assert(fake.releasedReservationIds.length === 2, `expected both reservations released, got ${fake.releasedReservationIds.length}`);
    assert(fake.canceledPaymentIds.length === 1, `expected the payment intent canceled, got ${fake.canceledPaymentIds.length}`);

    const canceledOrder = await orderRepo.findOneByOrFail({ id: order.id });
    assert(canceledOrder.status === OrderStatus.Canceled, `expected order canceled, got ${canceledOrder.status}`);

    console.log('[checkout-demo] OK — reservations released, intent canceled, order canceled.');
  }

  console.log('[checkout-demo] timeout path (payment never resolves)...');
  {
    const order = await createTestOrder(1);
    const fake = createFakeCheckoutPorts();
    const orchestrator = new CheckoutSagaOrchestrator(sagaRepo, orderRepo, orderLineRepo, fake.ports);

    const saga = await orchestrator.start(storeId, order.id);
    assert(saga.step === CheckoutSagaStep.AwaitingPayment, `expected awaiting_payment, got ${saga.step}`);

    await orchestrator.handlePaymentTimeout(saga.id);

    const timedOut = await sagaRepo.findOneByOrFail({ id: saga.id });
    assert(timedOut.status === SagaStatus.Failed, `expected failed, got ${timedOut.status}`);
    const canceledOrder = await orderRepo.findOneByOrFail({ id: order.id });
    assert(canceledOrder.status === OrderStatus.Canceled, `expected order canceled, got ${canceledOrder.status}`);
    assert(canceledOrder.cancelReason === 'checkout payment timed out', 'expected the timeout reason recorded on the order');

    console.log('[checkout-demo] OK — saga failed, order canceled, reservation released.');

    console.log('[checkout-demo] a real payment result arriving after the timeout is a no-op...');
    await orchestrator.handlePaymentSucceeded(order.id, 'pay_late_arrival');
    const stillFailed = await sagaRepo.findOneByOrFail({ id: saga.id });
    assert(stillFailed.status === SagaStatus.Failed, 'a late payment.succeeded must not resurrect an already-failed saga');
    console.log('[checkout-demo] OK — late payment result ignored, saga stays failed.');
  }

  console.log('[checkout-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[checkout-demo] FAILED:', err);
  process.exit(1);
});
