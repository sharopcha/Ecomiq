import { Shipment, ShipmentStatus } from '../entities/shipment.entity';
import { ShipmentEvent, ShipmentEventKind } from '../entities/shipment-event.entity';
import { shapeTrackingResponse } from './shape-tracking-response.util';

function makeShipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: 'shipment_1',
    storeId: 'store_1',
    displayId: 'SHP-42',
    orderId: 'order_1',
    fulfillmentId: 'fulfillment_1',
    status: ShipmentStatus.InProgress,
    isDelayed: false,
    delayReason: null,
    carrier: 'ups',
    serviceType: 'ground',
    shipDate: null,
    originAddress: { city: 'Cupertino', street: '1 Infinite Loop' },
    destinationAddress: { city: 'New York', street: '350 5th Ave', postalCode: '10001' },
    departureAt: null,
    expectedArrivalAt: new Date('2026-08-01T00:00:00.000Z'),
    totalTimeInterval: null,
    currentStage: 1,
    contactEmail: 'buyer@example.com',
    events: [],
    ...overrides,
  } as Shipment;
}

function makeEvent(overrides: Partial<ShipmentEvent> = {}): ShipmentEvent {
  return {
    id: 'event_1',
    kind: ShipmentEventKind.PickedUp,
    description: 'Picked up by carrier',
    location: 'Cupertino, CA',
    occurredAt: new Date('2026-07-20T00:00:00.000Z'),
    carrierEventId: 'carrier-evt-1',
    ...overrides,
  } as ShipmentEvent;
}

describe('shapeTrackingResponse', () => {
  it('carries the status/stage/delay/timeline fields the public page needs', () => {
    const result = shapeTrackingResponse(makeShipment(), [makeEvent()]);
    expect(result.displayId).toBe('SHP-42');
    expect(result.status).toBe(ShipmentStatus.InProgress);
    expect(result.currentStage).toBe(1);
    expect(result.isDelayed).toBe(false);
    expect(result.expectedArrivalAt).toBe('2026-08-01T00:00:00.000Z');
    expect(result.events).toEqual([
      {
        kind: ShipmentEventKind.PickedUp,
        description: 'Picked up by carrier',
        location: 'Cupertino, CA',
        occurredAt: '2026-07-20T00:00:00.000Z',
      },
    ]);
  });

  it('strips PII: no contactEmail, orderId, fulfillmentId, street address, or carrierEventId anywhere in the output', () => {
    const result = shapeTrackingResponse(makeShipment(), [makeEvent()]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('buyer@example.com');
    expect(serialized).not.toContain('order_1');
    expect(serialized).not.toContain('fulfillment_1');
    expect(serialized).not.toContain('350 5th Ave');
    expect(serialized).not.toContain('carrier-evt-1');
  });

  it('exposes only the destination city, not the full address object', () => {
    const result = shapeTrackingResponse(makeShipment(), []);
    expect(result.destinationCity).toBe('New York');
  });

  it('is null-safe when destinationAddress or expectedArrivalAt is absent', () => {
    const result = shapeTrackingResponse(makeShipment({ destinationAddress: null, expectedArrivalAt: null }), []);
    expect(result.destinationCity).toBeNull();
    expect(result.expectedArrivalAt).toBeNull();
  });

  it('is null-safe when destinationAddress has no city key', () => {
    const result = shapeTrackingResponse(makeShipment({ destinationAddress: { postalCode: '10001' } }), []);
    expect(result.destinationCity).toBeNull();
  });
});
