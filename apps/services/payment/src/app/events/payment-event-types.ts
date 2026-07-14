/**
 * Event type strings for payment-service's outbox rows, matching the repo
 * convention `<service>.<aggregate>.<verb>`
 * (apps/services/inventory/src/app/events/inventory-event-types.ts).
 *
 * `payment` is its own aggregate stream —
 * `topicForAggregate('ecomiq', 'payments', PAYMENT_AGGREGATE_TYPE)` ->
 * `payment.events`, `aggregateId = payment.id` — so every mutation of a
 * given intent (create/cancel, webhook-driven succeeded/failed) lands on
 * one ordered stream per payment. Refund events ride the *same* topic (a
 * payment's refunds are still that payment's lifecycle, same reasoning as
 * inventory folding stock_level events onto one stream) — new members get
 * appended here rather than starting a new file, same as inventory's
 * single map.
 */
export const PaymentEventType = {
  /** Published by PaymentsService.createIntent(). */
  PaymentCreated: 'payments.payment.created',
  /** Published by WebhookDispatchService on a signed `intent.succeeded` webhook. */
  PaymentSucceeded: 'payments.payment.succeeded',
  /** Published by WebhookDispatchService on a signed `intent.failed` webhook. */
  PaymentFailed: 'payments.payment.failed',
  /** Published by PaymentsService.cancelIntent(). */
  PaymentCanceled: 'payments.payment.canceled',
  /** Published once a `payments.refund.execute` command settles successfully. */
  RefundSucceeded: 'payments.refund.succeeded',
  /** Published once a `payments.refund.execute` command settles with a provider failure. */
  RefundFailed: 'payments.refund.failed',
} as const;

export const PAYMENT_AGGREGATE_TYPE = 'payment';
