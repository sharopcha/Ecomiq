/**
 * Local mirror of order-service's `orders.order.placed` event — same
 * "no shared contracts package yet, hand-copy from the producer"
 * convention as notification's `return-approved-event-payload.ts`. Keep
 * in sync with:
 *   apps/services/order/src/app/checkout/saga/checkout-saga.orchestrator.ts (handlePaymentSucceeded)
 *   apps/services/order/src/app/events/order-event-types.ts
 *     (OrderEventType.OrderPlaced = 'orders.order.placed', reserved for the checkout saga)
 *
 * `shippingAddress`/`contactEmail` were added to the producer's payload
 * additively for this consumer — the event had no consumer before
 * shipping-service, so nothing had needed a delivery address out of it
 * until now.
 */
export const ORDER_PLACED_EVENT_TYPE = 'orders.order.placed';

export interface OrderPlacedPayload {
  orderId: string;
  storeId: string;
  customerId: string | null;
  discountId: string | null;
  discountMinor: number;
  subtotalMinor: number;
  totalMinor: number;
  currency: string;
  shippingAddress: Record<string, unknown> | null;
  contactEmail: string | null;
  lines: Array<{ orderLineId: string; variantId: string; qty: number; reservationId: string | null }>;
}
