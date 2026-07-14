/**
 * Local mirror of order-service's `orders.return.approved` event — same
 * "no shared contracts package yet, hand-copy from the producer" convention
 * as `stock-low-event-payload.ts`. Keep in sync with:
 *   apps/services/order/src/app/returns/returns.service.ts (toEventPayload)
 *   apps/services/order/src/app/events/order-event-types.ts
 *     (OrderEventType.ReturnApproved = 'orders.return.approved')
 *
 * `email` was added to the producer's payload additively as part of this
 * plan's Step 10 — this event had no consumer before notification-service,
 * so nothing had needed a real recipient address out of it until now.
 */

export const RETURN_APPROVED_EVENT_TYPE = 'orders.return.approved';

export interface ReturnApprovedPayload {
  returnId: string;
  storeId: string;
  orderId: string;
  displayId: string;
  status: string;
  shippingStatus: string;
  inspected: boolean;
  email: string | null;
}
