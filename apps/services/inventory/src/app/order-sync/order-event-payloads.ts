/**
 * Local mirror of order-service's `orders.order.placed`/`orders.order.canceled`
 * event payload shapes — same "no shared contracts package for domain event
 * payloads, hand-copied per consumer" convention as `catalog-event-payloads.ts`
 * (this same service) and marketing's own `order-event-payloads.ts`. Keep
 * in sync with:
 *   apps/services/order/src/app/checkout/saga/checkout-saga.orchestrator.ts (handlePaymentSucceeded)
 *   apps/services/order/src/app/orders/orders.service.ts (cancel/toEventPayload)
 *   apps/services/order/src/app/events/order-event-types.ts
 *
 * Only the fields this consumer actually reads (`lines[].reservationId`,
 * mainly) are typed here; the real event carries more (totals, discount
 * info) that marketing's consumer reads instead.
 */
export const OrderEvent = {
  Placed: 'orders.order.placed',
  Canceled: 'orders.order.canceled',
} as const;

export interface OrderPlacedLinePayload {
  orderLineId: string;
  variantId: string;
  qty: number;
  reservationId?: string | null;
}

export interface OrderPlacedPayload {
  orderId: string;
  storeId: string;
  lines: OrderPlacedLinePayload[];
}

export interface OrderCanceledLinePayload {
  orderLineId: string;
  variantId: string;
  reservationId?: string | null;
}

export interface OrderCanceledPayload {
  orderId: string;
  storeId: string;
  /**
   * Absent on very old/malformed events — treat as "nothing to release"
   * rather than crashing the consumer. In practice always present per the
   * producer's current contract.
   */
  lines?: OrderCanceledLinePayload[];
}
