import { CheckoutSagaPorts } from '../app/checkout/saga/checkout-saga-ports';

export interface FakeCheckoutPortsControls {
  /** Set to fail ValidateDiscount with this reason; unset/null = succeed. */
  discountShouldFail?: string | null;
  /** Set to an orderLineId to fail ReserveStock for that specific line only; unset/null = every line succeeds. */
  failReservationForLine?: string | null;
  /** Set to fail CreatePaymentIntent with this reason; unset/null = succeed. */
  paymentShouldFail?: string | null;
}

/**
 * Fake `CheckoutSagaPorts` for `CheckoutSagaOrchestrator`'s own
 * verification — real network-free stand-ins for
 * inventory/payment/marketing's gRPC servers, keyed by `idempotencyKey` so a
 * retried call (resume-after-crash) returns the *same* reservation/payment
 * id instead of creating a new one, same guarantee the real servers provide.
 * `reserveStockCallCount`/`createPaymentIntentCallCount` let a demo script
 * assert a retried step's port method really was called again (proving
 * `run()`'s idempotent-replay actually happened) while the *result* stayed
 * identical.
 */
export function createFakeCheckoutPorts(controls: FakeCheckoutPortsControls = {}) {
  const reservationsByKey = new Map<string, string>();
  const paymentsByKey = new Map<string, string>();
  const releasedReservationIds: string[] = [];
  const canceledPaymentIds: string[] = [];
  let reserveStockCallCount = 0;
  let createPaymentIntentCallCount = 0;

  const ports: CheckoutSagaPorts = {
    discount: {
      async validateDiscount(input) {
        if (controls.discountShouldFail) {
          return { valid: false, reason: controls.discountShouldFail };
        }
        return { valid: true, discountId: `discount_${input.code}`, discountMinor: 500 };
      },
    },
    inventory: {
      async reserveStock(input) {
        reserveStockCallCount += 1;
        if (controls.failReservationForLine && input.orderLineId === controls.failReservationForLine) {
          return { reserved: false, reason: 'INSUFFICIENT_STOCK' };
        }
        const existing = reservationsByKey.get(input.idempotencyKey);
        if (existing) return { reserved: true, reservationId: existing };
        const reservationId = `res_${input.idempotencyKey}`;
        reservationsByKey.set(input.idempotencyKey, reservationId);
        return { reserved: true, reservationId };
      },
      async releaseReservation(input) {
        releasedReservationIds.push(input.reservationId);
      },
    },
    payment: {
      async createPaymentIntent(input) {
        createPaymentIntentCallCount += 1;
        if (controls.paymentShouldFail) {
          return { created: false, reason: controls.paymentShouldFail };
        }
        const existing = paymentsByKey.get(input.idempotencyKey);
        const paymentId = existing ?? `pay_${input.idempotencyKey}`;
        paymentsByKey.set(input.idempotencyKey, paymentId);
        return { created: true, paymentId, clientSecret: `secret_${paymentId}` };
      },
      async cancelPaymentIntent(input) {
        canceledPaymentIds.push(input.paymentId);
      },
    },
  };

  return {
    ports,
    releasedReservationIds,
    canceledPaymentIds,
    reservationsByKey,
    paymentsByKey,
    get reserveStockCallCount() {
      return reserveStockCallCount;
    },
    get createPaymentIntentCallCount() {
      return createPaymentIntentCallCount;
    },
  };
}
