import { StockMovementKind } from '../entities/stock-movement.entity';

export type StockField = 'onHand' | 'reserved';

/**
 * Which cell field a given movement kind mutates — see StockMovement's doc
 * comment. Pure and DB-free, extracted out of stock-movements.service.ts
 * purely so it's directly unit-testable without instantiating the whole
 * service — behavior is unchanged from the version originally embedded
 * there.
 */
export function targetFieldForKind(kind: StockMovementKind): StockField {
  switch (kind) {
    case StockMovementKind.Reservation:
    case StockMovementKind.Release:
      return 'reserved';
    case StockMovementKind.Sale:
    case StockMovementKind.Return:
    case StockMovementKind.PurchaseReceipt:
    case StockMovementKind.Adjustment:
    case StockMovementKind.Transfer:
      return 'onHand';
  }
}
