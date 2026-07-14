/**
 * Narrow interfaces the checkout saga orchestrator depends on —
 * deliberately independent of the
 * three raw gRPC clients' proto-shaped request/response types (see
 * `grpc-checkout-ports.ts` for the real adapter). `grpc-checkout-ports.ts`
 * implements these for production; `demo/fake-checkout-ports.ts` implements
 * them for the orchestrator's own unit tests. `=== false`/`=== true`
 * narrowing only (repo rule: no `strictNullChecks`).
 */

export type ValidateDiscountResult =
  | { valid: true; discountId: string; discountMinor: number }
  | { valid: false; reason: string };

export interface ValidateDiscountPort {
  validateDiscount(input: {
    storeId: string;
    code: string;
    customerId?: string | null;
    subtotalMinor: number;
    currency: string;
  }): Promise<ValidateDiscountResult>;
}

export type ReserveStockResult =
  | { reserved: true; reservationId: string }
  | { reserved: false; reason: string };

export interface InventoryPort {
  reserveStock(input: {
    storeId: string;
    variantId: string;
    qty: number;
    orderId: string;
    orderLineId: string;
    idempotencyKey: string;
  }): Promise<ReserveStockResult>;
  releaseReservation(input: { storeId: string; reservationId: string; idempotencyKey: string }): Promise<void>;
}

export type CreatePaymentIntentResult =
  | { created: true; paymentId: string; clientSecret: string }
  | { created: false; reason: string };

export interface PaymentPort {
  createPaymentIntent(input: {
    storeId: string;
    orderId: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<CreatePaymentIntentResult>;
  cancelPaymentIntent(input: { storeId: string; paymentId: string }): Promise<void>;
}

export interface CheckoutSagaPorts {
  discount: ValidateDiscountPort;
  inventory: InventoryPort;
  payment: PaymentPort;
}

export const CHECKOUT_SAGA_PORTS = Symbol('CHECKOUT_SAGA_PORTS');

/**
 * Compensation table encoded as data — queued onto
 * `SagaState.payload.compensations` in the order they must run,
 * executed in *reverse* by `CheckoutSagaOrchestrator.runCompensation`:
 *
 * | Failed step | Compensations executed (reverse order) |
 * |---|---|
 * | validating_discount | none — order stays open, saga failed, reason surfaced |
 * | reserving_stock (line k) | ReleaseReservation for lines 1..k-1 |
 * | creating_intent | ReleaseReservation for all lines |
 * | awaiting_payment timeout / payment failed | CancelPaymentIntent (ignore already-canceled), ReleaseReservation all lines, order -> canceled (needs the payment-event consumer) |
 */
export type CompensationAction =
  | { type: 'release_reservation'; reservationId: string }
  | { type: 'cancel_payment_intent'; paymentId: string };
