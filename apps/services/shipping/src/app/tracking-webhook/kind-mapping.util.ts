import { ShipmentEventKind } from '../entities/shipment-event.entity';

const VALID_KINDS = new Set<string>(Object.values(ShipmentEventKind));

export type TrackingKindEffect =
  | { action: 'ignore' }
  | { action: 'transition_arrived' }
  | { action: 'timeline'; kind: ShipmentEventKind };

/**
 * Pure mapping from a carrier webhook's raw `kind` string onto what
 * `TrackingWebhookService` should do with it: `delivered` drives a real
 * status transition (`shipping.shipment.arrived`), every other recognized
 * kind is a plain timeline entry (`stageForEventKind` still bumps
 * `currentStage`, just no status change), and anything unrecognized is
 * ignored — carriers retry-storm on 4xx/5xx, so an unfamiliar kind acks
 * 200 rather than rejecting.
 */
export function resolveTrackingKindEffect(kind: string): TrackingKindEffect {
  if (!VALID_KINDS.has(kind)) {
    return { action: 'ignore' };
  }
  if (kind === ShipmentEventKind.Delivered) {
    return { action: 'transition_arrived' };
  }
  return { action: 'timeline', kind: kind as ShipmentEventKind };
}
