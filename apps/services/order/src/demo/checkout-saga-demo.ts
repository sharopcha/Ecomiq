/**
 * Runnable proof — boots the real
 * Nest application context (real `Order`/`OrderLine`/`SagaState` repos,
 * Postgres via `order_db`) but drives `CheckoutSagaOrchestrator` directly
 * against `createFakeCheckoutPorts` (network-free stand-ins for
 * inventory/payment/marketing's gRPC servers) instead of the real
 * `CHECKOUT_SAGA_PORTS` DI provider — exercised against fake port
 * implementations, just through a real database instead of
 * embedded-postgres (this sandbox has none — same substitution every
 * migration/demo verification in this repo uses).
 *
 * Run:
 *   npm run order:checkout-saga-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app/app.module';
import { OrdersService } from '../app/orders/orders.service';
import { Order, OrderStatus } from '../app/entities/order.entity';
import { OrderLine } from '../app/entities/order-line.entity';
import { SagaState, SagaStatus, SagaType } from '../app/entities/saga-state.entity';
import { CheckoutSagaOrchestrator, CheckoutSagaStep } from '../app/checkout/saga/checkout-saga.orchestrator';
import { createFakeCheckoutPorts } from './fake-checkout-ports';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[checkout-saga-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${Date.now()}`;

  const orders = app.get(OrdersService);
  const sagaRepo = app.get<Repository<SagaState>>(getRepositoryToken(SagaState));
  const orderRepo = app.get<Repository<Order>>(getRepositoryToken(Order));
  const orderLineRepo = app.get<Repository<OrderLine>>(getRepositoryToken(OrderLine));

  async function createTestOrder(lineCount = 2): Promise<Order> {
    const lines = Array.from({ length: lineCount }, (_, i) => ({
      variantId: `variant_${i}`,
      name: `Item ${i}`,
      qty: 1,
      unitPriceMinor: 1000,
    }));
    return orders.create(storeId, { status: OrderStatus.Open, lines });
  }

  console.log('[checkout-saga-demo] happy path (no discount)...');
  {
    const order = await createTestOrder(2);
    const fake = createFakeCheckoutPorts();
    const orchestrator = new CheckoutSagaOrchestrator(sagaRepo, orderRepo, orderLineRepo, fake.ports);
    const saga = await orchestrator.start(storeId, order.id);
    assert(saga.status === SagaStatus.Running, `expected running, got ${saga.status}`);
    assert(saga.step === CheckoutSagaStep.AwaitingPayment, `expected awaiting_payment, got ${saga.step}`);
    assert(fake.reserveStockCallCount === 2, `expected 2 reserveStock calls, got ${fake.reserveStockCallCount}`);
    assert(fake.createPaymentIntentCallCount === 1, `expected 1 createPaymentIntent call, got ${fake.createPaymentIntentCallCount}`);
    console.log('[checkout-saga-demo] OK — reached awaiting_payment with 2 reservations + 1 intent.');
  }

  console.log('[checkout-saga-demo] happy path with a discount code...');
  {
    const order = await createTestOrder(1);
    const fake = createFakeCheckoutPorts();
    const orchestrator = new CheckoutSagaOrchestrator(sagaRepo, orderRepo, orderLineRepo, fake.ports);
    const saga = await orchestrator.start(storeId, order.id, 'SAVE10');
    assert(saga.step === CheckoutSagaStep.AwaitingPayment, `expected awaiting_payment, got ${saga.step}`);
    const payload = saga.payload as Record<string, unknown>;
    assert(payload.discountId === 'discount_SAVE10', 'expected discountId to be recorded on the saga payload');
    console.log('[checkout-saga-demo] OK — discount validated and recorded.');
  }

  console.log('[checkout-saga-demo] failure at validating_discount (no compensation table row)...');
  {
    const order = await createTestOrder(1);
    const fake = createFakeCheckoutPorts({ discountShouldFail: 'EXPIRED' });
    const orchestrator = new CheckoutSagaOrchestrator(sagaRepo, orderRepo, orderLineRepo, fake.ports);
    const saga = await orchestrator.start(storeId, order.id, 'EXPIRED10');
    assert(saga.status === SagaStatus.Failed, `expected failed, got ${saga.status}`);
    assert(fake.reserveStockCallCount === 0, 'expected zero reservations attempted');
    assert(fake.releasedReservationIds.length === 0, 'expected zero releases — nothing was reserved yet');
    console.log('[checkout-saga-demo] OK — failed cleanly with nothing to compensate.');
  }

  console.log('[checkout-saga-demo] failure at reserving_stock (partial rollback)...');
  {
    const order = await createTestOrder(3);
    // Same unsorted query `start()` itself runs internally — matching it
    // exactly (rather than re-sorting by id) is what makes "the second
    // line" here actually mean the second line the orchestrator's own loop
    // processes. ULIDs generated within the same millisecond don't sort in
    // creation order, so re-sorting by id here previously picked a
    // different line than the one the orchestrator iterated to second,
    // flaking this assertion.
    const lines = await orderLineRepo.find({ where: { order: { id: order.id } } });
    const failLine = lines[1];
    const fake = createFakeCheckoutPorts({ failReservationForLine: failLine.id });
    const orchestrator = new CheckoutSagaOrchestrator(sagaRepo, orderRepo, orderLineRepo, fake.ports);
    const saga = await orchestrator.start(storeId, order.id);
    assert(saga.status === SagaStatus.Failed, `expected failed, got ${saga.status}`);
    assert(
      fake.releasedReservationIds.length === 1,
      `expected exactly 1 release (the first line's reservation), got ${fake.releasedReservationIds.length}`,
    );
    console.log('[checkout-saga-demo] OK — first line released, second/third never reserved.');
  }

  console.log('[checkout-saga-demo] failure at creating_intent (full rollback)...');
  {
    const order = await createTestOrder(2);
    const fake = createFakeCheckoutPorts({ paymentShouldFail: 'PROVIDER_UNAVAILABLE' });
    const orchestrator = new CheckoutSagaOrchestrator(sagaRepo, orderRepo, orderLineRepo, fake.ports);
    const saga = await orchestrator.start(storeId, order.id);
    assert(saga.status === SagaStatus.Failed, `expected failed, got ${saga.status}`);
    assert(
      fake.releasedReservationIds.length === 2,
      `expected both reservations released, got ${fake.releasedReservationIds.length}`,
    );
    console.log('[checkout-saga-demo] OK — both reservations released after intent creation failed.');
  }

  async function makeStaleSaga(step: string, order: Order, extraPayload: Record<string, unknown> = {}) {
    const lines = await orderLineRepo.find({ where: { order: { id: order.id } } });
    const saga = await sagaRepo.save(
      sagaRepo.create({
        storeId,
        order,
        sagaType: SagaType.Checkout,
        status: SagaStatus.Running,
        step,
        payload: {
          subtotalMinor: order.subtotalMinor,
          currency: order.currency,
          totalMinor: order.totalMinor,
          lineReservations: lines.map((l) => ({ orderLineId: l.id, variantId: l.variantId, qty: l.qty })),
          compensations: [],
          ...extraPayload,
        },
      }),
    );
    await sagaRepo.update(saga.id, { updatedAt: new Date(Date.now() - 60_000) });
    return saga;
  }

  console.log('[checkout-saga-demo] resume-after-crash from validating_discount...');
  {
    const order = await createTestOrder(1);
    const stale = await makeStaleSaga(CheckoutSagaStep.ValidatingDiscount, order);
    const fake = createFakeCheckoutPorts();
    const orchestrator = new CheckoutSagaOrchestrator(sagaRepo, orderRepo, orderLineRepo, fake.ports);
    const resumed = await orchestrator.resumeStaleSagas(30_000);
    const found = resumed.find((s) => s.id === stale.id);
    assert(!!found, 'expected the stale validating_discount saga to be resumed');
    assert((found as SagaState).step === CheckoutSagaStep.AwaitingPayment, 'expected it to reach awaiting_payment');
    console.log('[checkout-saga-demo] OK — resumed from validating_discount to awaiting_payment.');
  }

  console.log('[checkout-saga-demo] resume-after-crash from reserving_stock...');
  {
    const order = await createTestOrder(2);
    const stale = await makeStaleSaga(CheckoutSagaStep.ReservingStock, order);
    const fake = createFakeCheckoutPorts();
    const orchestrator = new CheckoutSagaOrchestrator(sagaRepo, orderRepo, orderLineRepo, fake.ports);
    const resumed = await orchestrator.resumeStaleSagas(30_000);
    const found = resumed.find((s) => s.id === stale.id);
    assert(!!found, 'expected the stale reserving_stock saga to be resumed');
    assert((found as SagaState).step === CheckoutSagaStep.AwaitingPayment, 'expected it to reach awaiting_payment');
    console.log('[checkout-saga-demo] OK — resumed from reserving_stock to awaiting_payment.');
  }

  console.log('[checkout-saga-demo] resume-after-crash from creating_intent...');
  {
    const order = await createTestOrder(1);
    const stale = await makeStaleSaga(CheckoutSagaStep.CreatingIntent, order);
    const fake = createFakeCheckoutPorts();
    const orchestrator = new CheckoutSagaOrchestrator(sagaRepo, orderRepo, orderLineRepo, fake.ports);
    const resumed = await orchestrator.resumeStaleSagas(30_000);
    const found = resumed.find((s) => s.id === stale.id);
    assert(!!found, 'expected the stale creating_intent saga to be resumed');
    assert((found as SagaState).step === CheckoutSagaStep.AwaitingPayment, 'expected it to reach awaiting_payment');
    console.log('[checkout-saga-demo] OK — resumed from creating_intent to awaiting_payment.');
  }

  console.log('[checkout-saga-demo] a saga genuinely awaiting_payment is left untouched by resumeStaleSagas...');
  {
    const order = await createTestOrder(1);
    const stale = await makeStaleSaga(CheckoutSagaStep.AwaitingPayment, order, { paymentId: 'pay_existing' });
    const fake = createFakeCheckoutPorts();
    const orchestrator = new CheckoutSagaOrchestrator(sagaRepo, orderRepo, orderLineRepo, fake.ports);
    const resumed = await orchestrator.resumeStaleSagas(30_000);
    const found = resumed.find((s) => s.id === stale.id);
    assert(!!found, 'expected resumeStaleSagas to still return it (it is stale + running)');
    assert((found as SagaState).step === CheckoutSagaStep.AwaitingPayment, 'expected it to remain at awaiting_payment');
    assert(fake.reserveStockCallCount === 0 && fake.createPaymentIntentCallCount === 0, 'expected zero port calls — nothing for run() to do');
    console.log('[checkout-saga-demo] OK — awaiting_payment saga left exactly as-is.');
  }

  console.log('[checkout-saga-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[checkout-saga-demo] FAILED:', err);
  process.exit(1);
});
