import { AlertOperator } from '../entities/stock-alert.entity';

/**
 * Does `value` currently satisfy this alert's/rule's comparison? Same
 * function is called with a "before" and an "after" value around a movement
 * to detect a fresh crossing — see StockMovementsService's
 * checkAndPublishLowStockAlerts. Pure and DB-free, extracted out of
 * stock-movements.service.ts purely so it's directly unit-testable —
 * behavior is unchanged from the version originally embedded there.
 */
export function matchesAlert(value: number, threshold: number, direction: AlertOperator): boolean {
  switch (direction) {
    case AlertOperator.LowerThan:
      return value < threshold;
    case AlertOperator.GreaterThan:
      return value > threshold;
    case AlertOperator.Equals:
      return value === threshold;
  }
}
