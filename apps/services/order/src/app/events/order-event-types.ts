/**
 * Event type strings for order-service's outbox rows, matching the repo
 * convention `<service>.<aggregate>.<verb>`
 * (apps/services/inventory/src/app/events/inventory-event-types.ts).
 *
 * `order` is its own aggregate stream —
 * `topicForAggregate('ecomiq', 'orders', ORDER_AGGREGATE_TYPE)` ->
 * `orders/order.events`, `aggregateId = order.id`. Return/RMA events
 * append their own members here rather than starting a new file, same as
 * inventory's single map.
 *
 * `OrderPlaced` is **reserved for the checkout saga** — the manual/draft
 * creation flow emits `OrderCreated`, never `OrderPlaced`. The marketing
 * discount-usage consumer and the inventory consumer both key off
 * `orders.order.placed`/`orders.order.canceled` specifically, not
 * `.created` — do not repoint them at `.created`.
 */
export const OrderEventType = {
  OrderCreated: 'orders.order.created',
  OrderUpdated: 'orders.order.updated',
  OrderCanceled: 'orders.order.canceled',
  OrderStageChanged: 'orders.order.stage_changed',
  /** Reserved for the checkout saga's successful hand-off from `awaiting_payment`. */
  OrderPlaced: 'orders.order.placed',
  /**
   * The self-addressed delayed-message trigger for checkout payment
   * timeout, same "outbox row with a future deliverAt IS the delayed
   * message" mechanism as `ReturnExpiryCheck` above.
   * `CheckoutSagaOrchestrator.enterAwaitingPayment` records this alongside
   * the transition to `awaiting_payment`; the handler compensates only if
   * the saga is *still* `awaiting_payment` when it finally arrives (a real
   * payment result may have already resolved it first).
   */
  OrderPaymentTimeout: 'orders.order.payment_timeout',

  // RMA (return_request) lifecycle. Own aggregate stream: `topicForAggregate('ecomiq', 'orders', RETURN_AGGREGATE_TYPE)` -> `orders/return.events`, `aggregateId = return_request.id`.
  ReturnRequested: 'orders.return.requested',
  ReturnApproved: 'orders.return.approved',
  ReturnRejected: 'orders.return.rejected',
  ReturnExpired: 'orders.return.expired',
  ReturnResolved: 'orders.return.resolved',
  ReturnShippingStatusChanged: 'orders.return.shipping_status_changed',
  /**
   * The self-addressed delayed-message trigger for RMA auto-expiry —
   * `ReturnsService.create()` records this via the normal
   * `recordOutboxEvent(..., deliverAt: expiresAt)` alongside `.requested`,
   * same "outbox row with a future deliverAt IS the delayed message"
   * mechanism as inventory's `ReservationExpiryCheck` — there is no
   * separate manual Pulsar producer call.
   * `ReturnExpiryController` (a second PulsarServer connection on
   * order-service's own `orders` namespace, wired in main.ts) is what
   * receives it once Pulsar finally delivers it.
   */
  ReturnExpiryCheck: 'orders.return.expiry_check',

  // Refund decisioning. Own aggregate stream: `topicForAggregate('ecomiq', 'orders', REFUND_AGGREGATE_TYPE)` -> `orders/refund.events`, `aggregateId = refund.id`.
  RefundRequested: 'orders.refund.requested',
  RefundApproved: 'orders.refund.approved',
  RefundDeclined: 'orders.refund.declined',
  /** The refund settlement loop's terminal event, once `payments.refund.succeeded` lands. */
  RefundSettled: 'orders.refund.settled',
} as const;

export const ORDER_AGGREGATE_TYPE = 'order';
export const RETURN_AGGREGATE_TYPE = 'return';
export const REFUND_AGGREGATE_TYPE = 'refund';
