/**
 * Local mirror of payment-service's `payments.payment.succeeded`/`.failed`
 * outbox payload shapes (`apps/services/payment/src/app/webhooks/webhook-dispatch.service.ts`)
 * — same "no shared contracts package for domain event payloads, hand-copied
 * per consumer" convention as inventory's `catalog-event-payloads.ts` and
 * marketing's `order-event-payloads.ts` (duplication here is per-service by
 * design, not an oversight). Only the fields this consumer actually reads
 * are typed here.
 */
export const PaymentEvent = {
  Succeeded: 'payments.payment.succeeded',
  Failed: 'payments.payment.failed',
} as const;

export interface PaymentSucceededPayload {
  paymentId: string;
  orderId: string;
  storeId: string;
  amountMinor: number;
}

export interface PaymentFailedPayload {
  paymentId: string;
  orderId: string;
  storeId: string;
  amountMinor: number;
  failureReason?: string;
}
