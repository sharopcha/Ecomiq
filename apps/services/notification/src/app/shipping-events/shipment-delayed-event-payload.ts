/**
 * Local mirror of shipping-service's `shipping.shipment.delayed` event —
 * same "no shared contracts package yet, hand-copy from the producer"
 * convention as `return-events/return-approved-event-payload.ts`. Keep in
 * sync with:
 *   apps/services/shipping/src/app/shipments/shipments.service.ts (markDelayed)
 *   apps/services/shipping/src/app/events/shipping-event-types.ts
 *     (ShipmentEventType.ShipmentDelayed = 'shipping.shipment.delayed')
 *
 * `orderId`/`displayId`/`contactEmail` were added to the producer's payload
 * additively for this consumer — the event had no consumer before
 * notification-service, so nothing had needed a recipient address or
 * order reference out of it until now.
 */
export const SHIPMENT_DELAYED_EVENT_TYPE = 'shipping.shipment.delayed';

export interface ShipmentDelayedPayload {
  shipmentId: string;
  orderId: string;
  displayId: string;
  delayReason: string;
  contactEmail: string | null;
}
