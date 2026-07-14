import { ShipmentStatus } from '../entities/shipment.entity';
import { canTransition } from './transition-guard.util';

describe('canTransition', () => {
  it.each([
    [ShipmentStatus.Draft, ShipmentStatus.InProgress],
    [ShipmentStatus.Draft, ShipmentStatus.Canceled],
    [ShipmentStatus.InProgress, ShipmentStatus.Arrived],
    [ShipmentStatus.InProgress, ShipmentStatus.Canceled],
  ])('allows %s -> %s', (from, to) => {
    const result = canTransition(from, to);
    expect(result.ok).toBe(true);
  });

  it.each([
    [ShipmentStatus.Draft, ShipmentStatus.Arrived],
    [ShipmentStatus.Arrived, ShipmentStatus.InProgress],
    [ShipmentStatus.Arrived, ShipmentStatus.Canceled],
    [ShipmentStatus.Canceled, ShipmentStatus.InProgress],
    [ShipmentStatus.Canceled, ShipmentStatus.Draft],
  ])('refuses %s -> %s', (from, to) => {
    const result = canTransition(from, to);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('ILLEGAL_TRANSITION');
  });
});
