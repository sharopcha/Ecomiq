import { ShipmentEventKind } from '../entities/shipment-event.entity';

/**
 * Maps a timeline event kind onto the 4-icon progress bar (0..3). `null`
 * means the kind doesn't move the needle (e.g. `exception` — logged for
 * the record, doesn't imply forward progress). Callers only ever apply the
 * *max* of the current stage and this result — stage never regresses from
 * a late-arriving or out-of-order event.
 */
const STAGE_BY_KIND: Partial<Record<ShipmentEventKind, number>> = {
  [ShipmentEventKind.OrderPlaced]: 0,
  [ShipmentEventKind.PreparingToShip]: 0,
  [ShipmentEventKind.ConfirmShipment]: 0,
  [ShipmentEventKind.PickedUp]: 1,
  [ShipmentEventKind.InTransit]: 1,
  [ShipmentEventKind.OutForDelivery]: 2,
  [ShipmentEventKind.Delivered]: 3,
};

export function stageForEventKind(kind: ShipmentEventKind): number | null {
  return STAGE_BY_KIND[kind] ?? null;
}
