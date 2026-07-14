import { RefundType } from '../entities/refund.entity';

export type AssertRefundAmountResult =
  | { ok: true }
  | { ok: false; reason: 'INVALID_FOR_NONE' | 'EXCEEDS_REMAINING' };

/**
 * Pure, spec-covered (data-model rule 4): `refundType: 'none'` ⇒
 * `amountMinor` must be exactly 0 — anything
 * else means the caller is confusing "no refund" with "a refund of some
 * amount." Otherwise, cumulative refunds (this request's amount plus every
 * prior non-declined refund against the same order) must never exceed the
 * order's total — the boundary is inclusive (exactly the remaining amount
 * is fine; one minor unit over is not). `=== false` narrowing only (repo
 * rule: no `strictNullChecks`).
 */
export function assertRefundAmount(input: {
  refundType: RefundType;
  amountMinor: number;
  orderTotalMinor: number;
  priorRefundsMinor: number;
}): AssertRefundAmountResult {
  if (input.refundType === RefundType.None) {
    return input.amountMinor === 0 ? { ok: true } : { ok: false, reason: 'INVALID_FOR_NONE' };
  }

  const remaining = input.orderTotalMinor - input.priorRefundsMinor;
  if (input.amountMinor > remaining) {
    return { ok: false, reason: 'EXCEEDS_REMAINING' };
  }
  return { ok: true };
}
