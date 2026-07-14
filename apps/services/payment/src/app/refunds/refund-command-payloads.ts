/**
 * Command type + payload shape for `payments/payment.commands` —
 * order-service *approves* refunds (its own `refund` table/request); this
 * is payment-service's side of *executing* one via the bound
 * `PaymentProviderPort`. Commands
 * reuse `EventEnvelope` on the wire (see `topicForCommands`'s doc comment)
 * — `eventType` doubles as the command type below, dispatched via the same
 * `@EventPattern` mechanism a domain-event handler uses (see
 * `RefundCommandsController`).
 */
export const REFUND_EXECUTE_COMMAND = 'payments.refund.execute';

export interface RefundExecuteCommandPayload {
  /** order-service's refund request row id — becomes RefundExecution.idempotencyKey. */
  refundId: string;
  orderId: string;
  paymentId: string;
  amountMinor: number;
  reason?: string;
}
