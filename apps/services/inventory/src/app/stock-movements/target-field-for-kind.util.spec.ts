import { StockMovementKind } from '../entities/stock-movement.entity';
import { targetFieldForKind } from './target-field-for-kind.util';

describe('targetFieldForKind', () => {
  it.each([
    [StockMovementKind.Reservation, 'reserved'],
    [StockMovementKind.Release, 'reserved'],
  ])('maps %s to reserved', (kind, expected) => {
    expect(targetFieldForKind(kind)).toBe(expected);
  });

  it.each([
    [StockMovementKind.Sale, 'onHand'],
    [StockMovementKind.Return, 'onHand'],
    [StockMovementKind.PurchaseReceipt, 'onHand'],
    [StockMovementKind.Adjustment, 'onHand'],
    [StockMovementKind.Transfer, 'onHand'],
  ])('maps %s to onHand', (kind, expected) => {
    expect(targetFieldForKind(kind)).toBe(expected);
  });

  it('covers every StockMovementKind member (fails loudly if a new kind is added without updating the mapping)', () => {
    const allKinds = Object.values(StockMovementKind);
    for (const kind of allKinds) {
      expect(['onHand', 'reserved']).toContain(targetFieldForKind(kind));
    }
  });
});
