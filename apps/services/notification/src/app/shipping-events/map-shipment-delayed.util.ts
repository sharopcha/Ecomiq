import { SendChannel } from '../entities/send-log.entity';
import { TemplateKind } from '../entities/email-template.entity';
import { MappedDispatchInput } from '../notify-commands/map-notify-command.util';
import { ShipmentDelayedPayload } from './shipment-delayed-event-payload';

export type MapShipmentDelayedResult =
  | { action: 'dispatch'; input: MappedDispatchInput }
  | { action: 'skip'; reason: string };

/**
 * Pure mapper — `shipping.shipment.delayed` → a customer delay email
 * (`shipment_delay` template kind, already shipped with a built-in
 * default). Skips (rather than dispatching to a blank recipient) if the
 * payload carries no customer email — same defensive-skip precedent as
 * `mapReturnApproved`.
 */
export function mapShipmentDelayed(payload: ShipmentDelayedPayload): MapShipmentDelayedResult {
  if (!payload.contactEmail) {
    return { action: 'skip', reason: 'shipment-delayed payload has no customer email' };
  }
  return {
    action: 'dispatch',
    input: {
      channel: SendChannel.Email,
      recipient: payload.contactEmail,
      templateKind: TemplateKind.ShipmentDelay,
      vars: { Order_ID: payload.orderId },
      refTable: 'shipment',
      refId: payload.shipmentId,
    },
  };
}
