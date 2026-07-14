import { mapShipmentDelayed } from './map-shipment-delayed.util';
import { SendChannel } from '../entities/send-log.entity';
import { TemplateKind } from '../entities/email-template.entity';
import { ShipmentDelayedPayload } from './shipment-delayed-event-payload';

const basePayload: ShipmentDelayedPayload = {
  shipmentId: 'shipment_1',
  orderId: 'order_1',
  displayId: 'SHP-1042',
  delayReason: 'Expected arrival passed',
  contactEmail: 'ada@example.com',
};

describe('mapShipmentDelayed', () => {
  it('maps to a customer delay email', () => {
    const result = mapShipmentDelayed(basePayload);
    expect(result.action).toBe('dispatch');
    if (result.action !== 'dispatch') return;
    expect(result.input.channel).toBe(SendChannel.Email);
    expect(result.input.recipient).toBe('ada@example.com');
    expect(result.input.templateKind).toBe(TemplateKind.ShipmentDelay);
    expect(result.input.vars).toEqual({ Order_ID: 'order_1' });
    expect(result.input.refTable).toBe('shipment');
    expect(result.input.refId).toBe('shipment_1');
  });

  it('skips when the payload carries no customer email', () => {
    const result = mapShipmentDelayed({ ...basePayload, contactEmail: null });
    expect(result.action).toBe('skip');
    if (result.action !== 'skip') return;
    expect(result.reason).toMatch(/email/);
  });

  it('skips on an empty-string email too', () => {
    const result = mapShipmentDelayed({ ...basePayload, contactEmail: '' });
    expect(result.action).toBe('skip');
  });
});
