import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Order, OrderPaymentStatus, OrderStage, OrderStatus } from '../../entities/order.entity';
import { OrderLine } from '../../entities/order-line.entity';
import { SagaState, SagaStatus, SagaType } from '../../entities/saga-state.entity';
import { writeActivityLog } from '../../common/activity-log.util';
import { ORDER_AGGREGATE_TYPE, OrderEventType } from '../../events/order-event-types';
import { CHECKOUT_SAGA_PORTS, CheckoutSagaPorts, CompensationAction } from './checkout-saga-ports';

export const CheckoutSagaStep = {
  ValidatingDiscount: 'validating_discount',
  ReservingStock: 'reserving_stock',
  CreatingIntent: 'creating_intent',
  AwaitingPayment: 'awaiting_payment',
  Compensating: 'compensating',
  Completed: 'completed',
  Failed: 'failed',
} as const;

interface LineReservation {
  orderLineId: string;
  variantId: string;
  qty: number;
  reservationId?: string;
}

/** Everything a resumed-after-crash run needs — a snapshot of the order taken once at `start()`, not re-read on every step, so the saga's view of "what this checkout is" can't shift mid-flight even if the order itself is edited later. */
interface CheckoutSagaPayload {
  discountCode?: string | null;
  customerId?: string | null;
  subtotalMinor: number;
  currency: string;
  totalMinor: number;
  discountId?: string;
  discountMinor?: number;
  lineReservations: LineReservation[];
  paymentId?: string;
  clientSecret?: string;
  failureReason?: string;
  compensations?: CompensationAction[];
}

const SYNCHRONOUS_STEPS: string[] = [
  CheckoutSagaStep.ValidatingDiscount,
  CheckoutSagaStep.ReservingStock,
  CheckoutSagaStep.CreatingIntent,
];

/**
 * A persisted state machine over `saga_state` — not an in-memory chain.
 * Every step (a) reads the row, (b) performs exactly one side effect via a
 * `CheckoutSagaPorts` call, (c) persists the new step/payload. `run()`
 * drives a saga forward through its synchronous steps
 * (`validating_discount -> reserving_stock -> creating_intent`) in one
 * call, stopping at `awaiting_payment` — the point where continuing
 * depends on an external event (the payment-result consumer), not
 * anything this orchestrator can decide alone.
 *
 * Every port call is idempotent by construction (ReserveStock/CreatePaymentIntent
 * carry deterministic idempotency keys derived from `orderId`/`orderLineId` —
 * never a random value), which is what makes `resumeStaleSagas` safe:
 * re-running a step that already completed before a crash just replays the
 * same idempotency key and gets the same result back, not a duplicate side
 * effect.
 */
@Injectable()
export class CheckoutSagaOrchestrator {
  constructor(
    @InjectRepository(SagaState) private readonly sagaRepo: Repository<SagaState>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderLine) private readonly orderLineRepo: Repository<OrderLine>,
    @Inject(CHECKOUT_SAGA_PORTS) private readonly ports: CheckoutSagaPorts,
  ) {}

  /** Snapshots the order + its lines into the saga's payload, then drives it forward. */
  async start(storeId: string, orderId: string, discountCode?: string | null): Promise<SagaState> {
    const order = await this.orderRepo.findOneByOrFail({ id: orderId });
    const lines = await this.orderLineRepo.find({ where: { order: { id: orderId } } });

    const payload: CheckoutSagaPayload = {
      discountCode: discountCode ?? null,
      customerId: order.customerId ?? null,
      subtotalMinor: order.subtotalMinor,
      currency: order.currency,
      totalMinor: order.totalMinor,
      lineReservations: lines.map((line) => ({ orderLineId: line.id, variantId: line.variantId, qty: line.qty })),
      compensations: [],
    };

    const saga = this.sagaRepo.create({
      storeId,
      order,
      sagaType: SagaType.Checkout,
      step: CheckoutSagaStep.ValidatingDiscount,
      status: SagaStatus.Running,
      payload: payload as unknown as Record<string, unknown>,
    });
    const saved = await this.sagaRepo.save(saga);

    return this.run(saved.id);
  }

  /** Drives the saga through every synchronous step it can complete right now, then returns wherever it lands (`awaiting_payment`, `failed`, or already-terminal). Safe to call on a saga that's already past its synchronous steps — a no-op. */
  async run(sagaId: string): Promise<SagaState> {
    let saga = await this.loadWithOrder(sagaId);

    while (saga.status === SagaStatus.Running && SYNCHRONOUS_STEPS.includes(saga.step)) {
      saga = await this.advanceOnce(saga);
    }

    if (saga.status === SagaStatus.Compensating) {
      saga = await this.runCompensation(saga);
    }

    return saga;
  }

  /**
   * Crash-recovery: finds every `running` saga whose `updatedAt` is older
   * than `olderThanMs` and re-drives it via `run()`. A saga genuinely
   * `awaiting_payment` is also `status: running` but isn't in
   * `SYNCHRONOUS_STEPS`, so `run()`'s loop never touches it — this only
   * ever resumes a saga that crashed mid-synchronous-step, never one
   * legitimately waiting on the payment-result consumer.
   */
  async resumeStaleSagas(olderThanMs: number): Promise<SagaState[]> {
    const threshold = new Date(Date.now() - olderThanMs);
    const stale = await this.sagaRepo.find({
      where: { status: SagaStatus.Running, updatedAt: LessThan(threshold) },
      relations: { order: true },
    });

    const resumed: SagaState[] = [];
    for (const saga of stale) {
      resumed.push(await this.run(saga.id));
    }
    return resumed;
  }

  private async loadWithOrder(sagaId: string): Promise<SagaState> {
    return this.sagaRepo.findOneOrFail({ where: { id: sagaId }, relations: { order: true } });
  }

  private async advanceOnce(saga: SagaState): Promise<SagaState> {
    switch (saga.step) {
      case CheckoutSagaStep.ValidatingDiscount:
        return this.runValidatingDiscount(saga);
      case CheckoutSagaStep.ReservingStock:
        return this.runReservingStock(saga);
      case CheckoutSagaStep.CreatingIntent:
        return this.runCreatingIntent(saga);
      default:
        return saga;
    }
  }

  private async runValidatingDiscount(saga: SagaState): Promise<SagaState> {
    const payload = saga.payload as unknown as CheckoutSagaPayload;

    if (!payload.discountCode) {
      return this.transition(saga, CheckoutSagaStep.ReservingStock, payload);
    }

    const result = await this.ports.discount.validateDiscount({
      storeId: saga.storeId,
      code: payload.discountCode,
      customerId: payload.customerId,
      subtotalMinor: payload.subtotalMinor,
      currency: payload.currency,
    });

    if (result.valid === false) {
      // No compensation table row for this step — nothing has been reserved
      // or charged yet, so there's nothing to undo (see checkout-saga-ports.ts's table).
      return this.fail(saga, `discount validation failed: ${result.reason}`);
    }

    // Written onto the real order now, not just the saga payload — orders
    // never carry a discount at creation time; this saga step is the
    // only place `discountMinor`/`discountId`/`discountCode` ever get set.
    // Total is recomputed from the order's own (real, current) shipping/tax
    // columns rather than trusting the payload snapshot for anything beyond
    // subtotal/currency.
    const order = await this.orderRepo.findOneByOrFail({ id: saga.order.id });
    order.discountId = result.discountId;
    order.discountCode = payload.discountCode;
    order.discountMinor = result.discountMinor;
    order.totalMinor = order.subtotalMinor + order.shippingFeeMinor + order.taxMinor - result.discountMinor;
    await this.orderRepo.save(order);

    return this.transition(saga, CheckoutSagaStep.ReservingStock, {
      ...payload,
      discountId: result.discountId,
      discountMinor: result.discountMinor,
      totalMinor: order.totalMinor,
    });
  }

  private async runReservingStock(saga: SagaState): Promise<SagaState> {
    const payload = saga.payload as unknown as CheckoutSagaPayload;
    const lines = payload.lineReservations;
    const reservedSoFar: CompensationAction[] = [];

    for (const line of lines) {
      const idempotencyKey = `${saga.order.id}:${line.orderLineId}`;
      const result = await this.ports.inventory.reserveStock({
        storeId: saga.storeId,
        variantId: line.variantId,
        qty: line.qty,
        orderId: saga.order.id,
        orderLineId: line.orderLineId,
        idempotencyKey,
      });

      if (result.reserved === false) {
        return this.compensate(
          saga,
          reservedSoFar,
          `reserve stock failed for order line ${line.orderLineId}: ${result.reason}`,
        );
      }

      line.reservationId = result.reservationId;
      // Persisted onto the real order_line row, not just the saga
      // payload — the inventory commit/release consumer and any RMA
      // against this line need the reservationId findable without
      // reaching into saga_state.
      await this.orderLineRepo.update(line.orderLineId, { reservationId: result.reservationId });
      reservedSoFar.push({ type: 'release_reservation', reservationId: result.reservationId });
    }

    return this.transition(saga, CheckoutSagaStep.CreatingIntent, { ...payload, lineReservations: lines });
  }

  private async runCreatingIntent(saga: SagaState): Promise<SagaState> {
    const payload = saga.payload as unknown as CheckoutSagaPayload;

    const result = await this.ports.payment.createPaymentIntent({
      storeId: saga.storeId,
      orderId: saga.order.id,
      amountMinor: payload.totalMinor,
      currency: payload.currency,
      idempotencyKey: saga.order.id,
    });

    if (result.created === false) {
      const compensations: CompensationAction[] = payload.lineReservations
        .filter((line) => line.reservationId)
        .map((line) => ({ type: 'release_reservation', reservationId: line.reservationId as string }));
      return this.compensate(saga, compensations, `create payment intent failed: ${result.reason}`);
    }

    return this.enterAwaitingPayment(saga, {
      ...payload,
      paymentId: result.paymentId,
      clientSecret: result.clientSecret,
    });
  }

  /**
   * Handles `payments.payment.succeeded` — only acts if this order's saga
   * is still genuinely `awaiting_payment`; a duplicate delivery (Pulsar
   * redelivery, or arriving after the timeout already compensated it)
   * finds no matching row and is a silent no-op, same idempotency
   * mechanism as every other terminal state-check in this class.
   */
  async handlePaymentSucceeded(orderId: string, paymentId: string): Promise<void> {
    const saga = await this.sagaRepo.findOne({
      where: {
        order: { id: orderId },
        sagaType: SagaType.Checkout,
        status: SagaStatus.Running,
        step: CheckoutSagaStep.AwaitingPayment,
      },
      relations: { order: true },
    });
    if (!saga) return;

    const payload = saga.payload as unknown as CheckoutSagaPayload;

    await this.sagaRepo.manager.transaction(async (manager) => {
      saga.status = SagaStatus.Completed;
      saga.step = CheckoutSagaStep.Completed;
      saga.payload = { ...payload, paymentId } as unknown as Record<string, unknown>;
      await manager.save(saga);

      const order = saga.order;
      order.paymentId = paymentId;
      order.paymentStatus = OrderPaymentStatus.Paid;
      order.stage = OrderStage.PreparingOrder;
      await manager.save(order);

      await writeActivityLog(manager, {
        storeId: saga.storeId,
        subjectTable: 'order',
        subjectId: order.id,
        verb: 'order.placed',
        data: { paymentId },
      });

      // Payload contract documented in marketing's order-event-payloads.ts
      // and consumed by inventory-service's commit handler —
      // orderId/storeId/customerId/discountId/discountMinor/subtotalMinor
      // for the former, per-line variantId/qty/reservationId for the
      // latter. `shippingAddress`/`contactEmail` added additively
      // (nullable) for shipping-service's auto-draft consumer — the order
      // entity already carries both at creation time, this just puts them
      // on the wire for the first time.
      await recordOutboxEvent(manager, {
        eventType: OrderEventType.OrderPlaced,
        storeId: saga.storeId,
        aggregateType: ORDER_AGGREGATE_TYPE,
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          storeId: saga.storeId,
          customerId: payload.customerId ?? null,
          discountId: payload.discountId ?? null,
          discountMinor: payload.discountMinor ?? 0,
          subtotalMinor: payload.subtotalMinor,
          totalMinor: order.totalMinor,
          currency: payload.currency,
          shippingAddress: order.shippingAddress ?? null,
          contactEmail: order.contactEmail ?? null,
          lines: payload.lineReservations.map((line) => ({
            orderLineId: line.orderLineId,
            variantId: line.variantId,
            qty: line.qty,
            reservationId: line.reservationId,
          })),
        },
      });
    });
  }

  /** Handles `payments.payment.failed` — compensates only if the saga is still `awaiting_payment` (same idempotency reasoning as `handlePaymentSucceeded`). */
  async handlePaymentFailed(orderId: string, reason: string): Promise<void> {
    const saga = await this.sagaRepo.findOne({
      where: {
        order: { id: orderId },
        sagaType: SagaType.Checkout,
        status: SagaStatus.Running,
        step: CheckoutSagaStep.AwaitingPayment,
      },
      relations: { order: true },
    });
    if (!saga) return;

    await this.failAwaitingPayment(saga, reason);
  }

  /**
   * Handles the `orders.order.payment_timeout` delayed message
   * (`enterAwaitingPayment` below). Tolerates arriving after a real payment
   * result already resolved the saga one way or the other — the
   * `step: awaiting_payment` filter in the query below means a saga that's
   * already `completed` or already `failed` (compensated by
   * `handlePaymentFailed`) simply isn't found, and this is a no-op. State
   * decides, not arrival order.
   */
  async handlePaymentTimeout(sagaId: string): Promise<void> {
    const saga = await this.sagaRepo.findOne({
      where: { id: sagaId, status: SagaStatus.Running, step: CheckoutSagaStep.AwaitingPayment },
      relations: { order: true },
    });
    if (!saga) return;

    await this.failAwaitingPayment(saga, 'checkout payment timed out');
  }

  /**
   * The `awaiting_payment` branch of the compensation table — the one row
   * that also cancels the order itself (the earlier synchronous-step
   * failures leave the order `open` so a merchant can retry checkout;
   * by this point a real payment attempt has genuinely failed or timed
   * out, so the order itself is done).
   */
  private async failAwaitingPayment(saga: SagaState, reason: string): Promise<void> {
    const payload = saga.payload as unknown as CheckoutSagaPayload;
    const compensations: CompensationAction[] = [];
    if (payload.paymentId) {
      compensations.push({ type: 'cancel_payment_intent', paymentId: payload.paymentId });
    }
    for (const line of payload.lineReservations) {
      if (line.reservationId) {
        compensations.push({ type: 'release_reservation', reservationId: line.reservationId });
      }
    }

    await this.compensate(saga, compensations, reason);

    const order = await this.orderRepo.findOneByOrFail({ id: saga.order.id });
    if (order.status !== OrderStatus.Open && order.status !== OrderStatus.Draft) {
      return; // already canceled/completed by a racing trigger — idempotent no-op.
    }

    await this.orderRepo.manager.transaction(async (manager) => {
      order.status = OrderStatus.Canceled;
      order.canceledAt = new Date();
      order.cancelReason = reason;
      const savedOrder = await manager.save(order);

      await writeActivityLog(manager, {
        storeId: saga.storeId,
        subjectTable: 'order',
        subjectId: savedOrder.id,
        verb: 'order.canceled',
        data: { reason },
      });

      await recordOutboxEvent(manager, {
        eventType: OrderEventType.OrderCanceled,
        storeId: saga.storeId,
        aggregateType: ORDER_AGGREGATE_TYPE,
        aggregateId: savedOrder.id,
        payload: {
          orderId: savedOrder.id,
          storeId: saga.storeId,
          discountId: savedOrder.discountId ?? null,
          // The reservations were already released above by this same
          // failAwaitingPayment call (via compensate()) — carried here too
          // so the inventory consumer sees a consistent payload shape
          // regardless of which cancel path fired, even though it'll find
          // these already released and no-op on them.
          lines: payload.lineReservations.map((line) => ({
            orderLineId: line.orderLineId,
            variantId: line.variantId,
            reservationId: line.reservationId ?? null,
          })),
        },
      });
    });
  }

  /** Transitions into `awaiting_payment` and arms the payment-timeout delayed message (`orders.order.payment_timeout`, `CHECKOUT_PAYMENT_TIMEOUT_MINUTES` env, default 30) in the same transaction — same "outbox row with a future deliverAt IS the delayed message" mechanism as `OrderEventType.ReturnExpiryCheck`. */
  private async enterAwaitingPayment(saga: SagaState, payload: CheckoutSagaPayload): Promise<SagaState> {
    const deliverAt = new Date(Date.now() + this.paymentTimeoutMinutes() * 60 * 1000);
    saga.step = CheckoutSagaStep.AwaitingPayment;
    saga.payload = payload as unknown as Record<string, unknown>;
    saga.timeoutAt = deliverAt;

    return this.sagaRepo.manager.transaction(async (manager) => {
      const savedSaga = await manager.save(saga);
      await recordOutboxEvent(manager, {
        eventType: OrderEventType.OrderPaymentTimeout,
        storeId: saga.storeId,
        aggregateType: ORDER_AGGREGATE_TYPE,
        aggregateId: saga.order.id,
        payload: { sagaId: savedSaga.id, orderId: saga.order.id },
        deliverAt,
      });
      return savedSaga;
    });
  }

  private paymentTimeoutMinutes(): number {
    const raw = Number(process.env.CHECKOUT_PAYMENT_TIMEOUT_MINUTES ?? 30);
    return Number.isFinite(raw) && raw > 0 ? raw : 30;
  }

  private async transition(
    saga: SagaState,
    nextStep: string,
    payload: CheckoutSagaPayload,
  ): Promise<SagaState> {
    saga.step = nextStep;
    saga.payload = payload as unknown as Record<string, unknown>;
    return this.sagaRepo.save(saga);
  }

  private async fail(saga: SagaState, reason: string): Promise<SagaState> {
    const payload = saga.payload as unknown as CheckoutSagaPayload;
    saga.status = SagaStatus.Failed;
    saga.step = CheckoutSagaStep.Failed;
    saga.payload = { ...payload, failureReason: reason } as unknown as Record<string, unknown>;
    return this.sagaRepo.save(saga);
  }

  private async compensate(
    saga: SagaState,
    actions: CompensationAction[],
    reason: string,
  ): Promise<SagaState> {
    const payload = saga.payload as unknown as CheckoutSagaPayload;
    saga.status = SagaStatus.Compensating;
    saga.step = CheckoutSagaStep.Compensating;
    saga.payload = { ...payload, compensations: actions, failureReason: reason } as unknown as Record<string, unknown>;
    await this.sagaRepo.save(saga);
    return this.runCompensation(saga);
  }

  /** Executes queued compensations in reverse order (per the table in `checkout-saga-ports.ts`), then lands the saga on `failed`. */
  private async runCompensation(saga: SagaState): Promise<SagaState> {
    const payload = saga.payload as unknown as CheckoutSagaPayload;
    const actions = payload.compensations ?? [];

    for (const action of [...actions].reverse()) {
      if (action.type === 'release_reservation') {
        await this.ports.inventory.releaseReservation({
          storeId: saga.storeId,
          reservationId: action.reservationId,
          idempotencyKey: `compensate:${saga.id}:${action.reservationId}`,
        });
      } else if (action.type === 'cancel_payment_intent') {
        await this.ports.payment.cancelPaymentIntent({ storeId: saga.storeId, paymentId: action.paymentId });
      }
    }

    saga.status = SagaStatus.Failed;
    saga.step = CheckoutSagaStep.Failed;
    return this.sagaRepo.save(saga);
  }
}
