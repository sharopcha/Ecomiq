/**
 * Local mirror of shipping-service's `shipping.fulfillment.created` event —
 * same "no shared contracts package yet, hand-copy from the producer"
 * convention as notification-service's `shipment-delayed-event-payload.ts`.
 * Keep in sync with:
 *   apps/services/shipping/src/app/fulfillments/fulfillments.service.ts (create)
 *   apps/services/shipping/src/app/events/shipping-event-types.ts
 *     (ShippingFulfillmentEventType.FulfillmentCreated = 'shipping.fulfillment.created')
 */
export const FULFILLMENT_CREATED_EVENT_TYPE = 'shipping.fulfillment.created';

export interface FulfillmentCreatedPayload {
  fulfillmentId: string;
  orderId: string;
  lines: { orderLineId: string; qty: number }[];
  trackingNumbers: string[];
}
