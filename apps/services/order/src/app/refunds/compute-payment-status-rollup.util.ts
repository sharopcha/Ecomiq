import { OrderPaymentStatus } from '../entities/order.entity';

/**
 * Pure, spec-covered — the order's `paymentStatus` once at least one
 * refund has settled: fully covered by
 * settled refunds -> `refunded`, anything less (but more than zero) ->
 * `partially_refunded`. Only ever called from the settlement handler
 * (there's always at least one settled refund by the time it runs), so
 * `settledRefundsMinor <= 0` isn't a real input this function needs to
 * handle specially.
 */
export function computePaymentStatusRollup(
  orderTotalMinor: number,
  settledRefundsMinor: number,
): OrderPaymentStatus {
  return settledRefundsMinor >= orderTotalMinor ? OrderPaymentStatus.Refunded : OrderPaymentStatus.PartiallyRefunded;
}
