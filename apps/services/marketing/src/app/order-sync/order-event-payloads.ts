/**
 * Local mirror of order-service's `orders.order.placed`/`orders.order.canceled`
 * event payload shapes — same "no shared contracts package for domain
 * event payloads, hand-copied per consumer" convention as inventory's
 * `catalog-event-payloads.ts` (duplication here is per-service by design,
 * not an oversight).
 *
 * This is the payload *contract* order-service's checkout saga must honor
 * (`orders.order.placed` fires once `payments.payment.succeeded` lands;
 * see order-service's outbox payload spec) — keep this file in sync with
 * it if that changes. Only the fields this consumer actually reads are
 * typed here; the real event will carry more (order totals, lines, etc.)
 * that this consumer ignores.
 */

export const OrderEvent = {
  Placed: 'orders.order.placed',
  Canceled: 'orders.order.canceled',
} as const;

export interface OrderPlacedPayload {
  orderId: string;
  storeId: string;
  customerId?: string | null;
  /** Absent/null = no discount code was applied to this order — nothing for this consumer to do. */
  discountId?: string | null;
  discountMinor?: number;
  subtotalMinor?: number;
}

export interface OrderCanceledPayload {
  orderId: string;
  storeId: string;
  discountId?: string | null;
}
