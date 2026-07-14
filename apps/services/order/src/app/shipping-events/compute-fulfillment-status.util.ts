import { FulfillmentStatus } from '../entities/order.entity';

/**
 * Pure rollup: an order is `fulfilled` once every line's cumulative
 * `fulfilledQty` has caught up to its `qty`, `partially_fulfilled` once at
 * least one unit anywhere has shipped, else `unfulfilled`. An order with no
 * lines is `unfulfilled` — that state should never actually reach this
 * function (every order is created with at least one line), but it's the
 * only sane default if it ever did.
 */
export function computeFulfillmentStatus(lines: { qty: number; fulfilledQty: number }[]): FulfillmentStatus {
  if (lines.length === 0) return FulfillmentStatus.Unfulfilled;

  const totalQty = lines.reduce((sum, line) => sum + line.qty, 0);
  const totalFulfilled = lines.reduce((sum, line) => sum + Math.min(line.fulfilledQty, line.qty), 0);

  if (totalFulfilled <= 0) return FulfillmentStatus.Unfulfilled;
  if (totalFulfilled >= totalQty) return FulfillmentStatus.Fulfilled;
  return FulfillmentStatus.PartiallyFulfilled;
}
