import { Shipment } from '../entities/shipment.entity';
import { ShipmentEvent } from '../entities/shipment-event.entity';
import type { PublicTrackingResponseDto } from '@temp-nx/api-types/shipping';

export type TrackingResponse = PublicTrackingResponseDto;

/**
 * Public tracking page's response shape — strips everything the plan calls
 * out as PII (`contactEmail`, `orderId`, `fulfillmentId`, full
 * `originAddress`/`destinationAddress`, `ShipmentEvent.carrierEventId` — an
 * internal idempotency key, not customer data, but still not this page's
 * business) down to `destinationAddress.city` and the bare event timeline.
 * A stranger with a shipment's display id or tracking number should learn
 * "where it is," never "who it's going to."
 */
export function shapeTrackingResponse(shipment: Shipment, events: ShipmentEvent[]): TrackingResponse {
  const destinationCity = shipment.destinationAddress?.['city'];

  return {
    displayId: shipment.displayId,
    status: shipment.status,
    currentStage: shipment.currentStage,
    isDelayed: shipment.isDelayed,
    delayReason: shipment.delayReason ?? null,
    carrier: shipment.carrier ?? null,
    serviceType: shipment.serviceType ?? null,
    expectedArrivalAt: shipment.expectedArrivalAt ? new Date(shipment.expectedArrivalAt).toISOString() : null,
    destinationCity: typeof destinationCity === 'string' ? destinationCity : null,
    events: events.map((event) => ({
      kind: event.kind,
      description: event.description ?? null,
      location: event.location ?? null,
      occurredAt: new Date(event.occurredAt).toISOString(),
    })),
  };
}
