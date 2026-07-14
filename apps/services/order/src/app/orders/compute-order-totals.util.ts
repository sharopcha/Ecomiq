export interface OrderTotalsLineInput {
  qty: number;
  unitPriceMinor: number;
}

export interface OrderTotalsInput {
  lines: OrderTotalsLineInput[];
  shippingFeeMinor: number;
  discountMinor: number;
  taxMinor: number;
}

export interface OrderTotals {
  subtotalMinor: number;
  totalMinor: number;
}

/**
 * Pure, spec-covered: subtotal = Σ qty×unitPrice; total = subtotal +
 * shipping + tax − discount. Callers are responsible for handing in an
 * already-clamped `discountMinor` (marketing's `validateDiscount` clamps
 * to the subtotal at checkout time) — this function doesn't re-clamp, it
 * just adds up what it's given.
 */
export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const subtotalMinor = input.lines.reduce((sum, line) => sum + line.qty * line.unitPriceMinor, 0);
  const totalMinor = subtotalMinor + input.shippingFeeMinor + input.taxMinor - input.discountMinor;
  return { subtotalMinor, totalMinor };
}
