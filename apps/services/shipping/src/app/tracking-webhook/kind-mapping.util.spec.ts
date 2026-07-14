import { ShipmentEventKind } from '../entities/shipment-event.entity';
import { resolveTrackingKindEffect } from './kind-mapping.util';

describe('resolveTrackingKindEffect', () => {
  it('maps delivered to a status transition', () => {
    expect(resolveTrackingKindEffect('delivered')).toEqual({ action: 'transition_arrived' });
  });

  it.each([
    ['picked_up', ShipmentEventKind.PickedUp],
    ['in_transit', ShipmentEventKind.InTransit],
    ['out_for_delivery', ShipmentEventKind.OutForDelivery],
    ['exception', ShipmentEventKind.Exception],
  ])('maps %s to a plain timeline entry', (raw, expectedKind) => {
    expect(resolveTrackingKindEffect(raw)).toEqual({ action: 'timeline', kind: expectedKind });
  });

  it('ignores an unrecognized kind', () => {
    expect(resolveTrackingKindEffect('teleported')).toEqual({ action: 'ignore' });
  });
});
