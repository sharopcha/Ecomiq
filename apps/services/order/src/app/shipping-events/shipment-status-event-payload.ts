/**
 * Local mirror of shipping-service's `shipping.shipment.updated` /
 * `shipping.shipment.arrived` events — both share `Shipment.toEventPayload`'s
 * shape. Keep in sync with:
 *   apps/services/shipping/src/app/shipments/shipments.service.ts (toEventPayload, transition)
 *   apps/services/shipping/src/app/events/shipping-event-types.ts
 *     (ShipmentEventType.ShipmentUpdated = 'shipping.shipment.updated',
 *      ShipmentEventType.ShipmentArrived = 'shipping.shipment.arrived')
 */
export const SHIPMENT_UPDATED_EVENT_TYPE = 'shipping.shipment.updated';
export const SHIPMENT_ARRIVED_EVENT_TYPE = 'shipping.shipment.arrived';

export interface ShipmentStatusPayload {
  shipmentId: string;
  storeId: string;
  displayId: string;
  orderId: string;
  status: string;
  currentStage: number;
  contactEmail: string | null;
}
