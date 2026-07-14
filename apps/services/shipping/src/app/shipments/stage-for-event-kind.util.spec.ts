import { ShipmentEventKind } from '../entities/shipment-event.entity';
import { stageForEventKind } from './stage-for-event-kind.util';

describe('stageForEventKind', () => {
  it.each([
    [ShipmentEventKind.OrderPlaced, 0],
    [ShipmentEventKind.PreparingToShip, 0],
    [ShipmentEventKind.ConfirmShipment, 0],
    [ShipmentEventKind.PickedUp, 1],
    [ShipmentEventKind.InTransit, 1],
    [ShipmentEventKind.OutForDelivery, 2],
    [ShipmentEventKind.Delivered, 3],
  ])('maps %s to stage %i', (kind, expectedStage) => {
    expect(stageForEventKind(kind)).toBe(expectedStage);
  });

  it('returns null for exception — it does not move the progress bar', () => {
    expect(stageForEventKind(ShipmentEventKind.Exception)).toBeNull();
  });
});
