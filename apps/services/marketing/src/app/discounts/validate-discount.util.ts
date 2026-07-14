import { Discount, DiscountKind, DiscountStatus } from '../entities/discount.entity';

export type ValidateDiscountReason =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'USAGE_LIMIT_REACHED'
  | 'ONCE_PER_CUSTOMER'
  | 'MIN_SUBTOTAL_NOT_MET';

export type ValidateDiscountResult =
  | { valid: true; discountMinor: number }
  | { valid: false; reason: ValidateDiscountReason };

export interface ValidateDiscountInput {
  now: Date;
  customerId?: string | null;
  subtotalMinor: number;
  /** How many times this specific customer has already used this discount — 0 if `customerId` is absent or this is their first time. */
  priorCustomerUsageCount: number;
}

/**
 * Pure, spec-covered validation core — this exact union is reused
 * verbatim by the `ValidateDiscount` gRPC handler and any future REST
 * validation endpoint, so the reason set and ordering below are the
 * actual contract, not just this file's own concern. **`=== false`
 * narrowing only** (repo rule: `tsconfig.base.json` has no
 * `strictNullChecks`).
 *
 * Checks run in a deliberate order — existence, then lifecycle status,
 * then time window, then usage limits, then the subtotal floor — so a
 * caller always gets the *first* reason a code would fail, not
 * whichever the implementation happened to check last.
 */
export function validateDiscount(
  discount: Discount | null,
  input: ValidateDiscountInput,
): ValidateDiscountResult {
  if (!discount) {
    return { valid: false, reason: 'NOT_FOUND' };
  }
  if (discount.status !== DiscountStatus.Active) {
    return { valid: false, reason: 'INACTIVE' };
  }
  if (discount.startsAt && input.now < discount.startsAt) {
    return { valid: false, reason: 'NOT_STARTED' };
  }
  if (discount.endsAt && input.now > discount.endsAt) {
    return { valid: false, reason: 'EXPIRED' };
  }
  if (discount.usageLimit != null && discount.usageCount >= discount.usageLimit) {
    return { valid: false, reason: 'USAGE_LIMIT_REACHED' };
  }
  if (discount.oncePerCustomer && input.customerId && input.priorCustomerUsageCount > 0) {
    return { valid: false, reason: 'ONCE_PER_CUSTOMER' };
  }
  if (discount.minSubtotalMinor != null && input.subtotalMinor < discount.minSubtotalMinor) {
    return { valid: false, reason: 'MIN_SUBTOTAL_NOT_MET' };
  }

  return { valid: true, discountMinor: computeDiscountMinor(discount, input.subtotalMinor) };
}

/** Interprets `Discount.value` per `kind` — see that column's doc comment for the convention. Never returns more than the subtotal itself (a discount can't make a line negative). */
function computeDiscountMinor(discount: Discount, subtotalMinor: number): number {
  switch (discount.kind) {
    case DiscountKind.Percentage: {
      // basis points: 1000 = 10.00% -> value/10000 as a fraction.
      const raw = Math.floor((subtotalMinor * discount.value) / 10000);
      return Math.min(raw, subtotalMinor);
    }
    case DiscountKind.FixedAmount:
      return Math.min(discount.value, subtotalMinor);
    case DiscountKind.FreeShipping:
      // Eligibility-only — the shipping fee waiver itself is applied by
      // whatever computes the order's shipping_fee_minor, not here.
      return 0;
    default:
      return 0;
  }
}
