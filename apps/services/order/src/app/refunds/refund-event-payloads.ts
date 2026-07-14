/**
 * Local mirror of payment-service's `payments.refund.succeeded`/`.failed`
 * outbox payload shapes (`apps/services/payment/src/app/refunds/refunds.service.ts`'s
 * `toEventPayload`) — same "no shared contracts package for domain event
 * payloads, hand-copied per consumer" convention as every other
 * cross-service event contract in this plan.
 */
export const RefundExecutionEvent = {
  Succeeded: 'payments.refund.succeeded',
  Failed: 'payments.refund.failed',
} as const;

export interface RefundExecutionEventPayload {
  refundId: string;
  orderId: string;
  paymentId: string;
  amountMinor: number;
  status: string;
  providerRef?: string | null;
  failureReason?: string | null;
}
