/**
 * Local mirror of order-service's `orders.order.placed` event — same
 * "no shared contracts package yet, hand-copy from the producer" convention
 * as shipping's `order-placed-event-payload.ts`. Keep in sync with:
 *   apps/services/order/src/app/checkout/saga/checkout-saga.orchestrator.ts (handlePaymentSucceeded)
 *   apps/services/order/src/app/events/order-event-types.ts
 *     (OrderEventType.OrderPlaced = 'orders.order.placed')
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
