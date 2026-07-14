import { computeOrderTotals } from './compute-order-totals.util';

describe('computeOrderTotals', () => {
  it('sums qty×unitPrice across lines for the subtotal', () => {
    const { subtotalMinor } = computeOrderTotals({
      lines: [
        { qty: 2, unitPriceMinor: 1000 },
        { qty: 1, unitPriceMinor: 500 },
      ],
      shippingFeeMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
    });
    expect(subtotalMinor).toBe(2500);
  });

  it('returns 0 subtotal/total for an empty line list', () => {
    const result = computeOrderTotals({ lines: [], shippingFeeMinor: 0, discountMinor: 0, taxMinor: 0 });
    expect(result).toEqual({ subtotalMinor: 0, totalMinor: 0 });
  });

  it('adds shipping and tax, then subtracts discount, for the total', () => {
    const { subtotalMinor, totalMinor } = computeOrderTotals({
      lines: [{ qty: 1, unitPriceMinor: 10000 }],
      shippingFeeMinor: 500,
      discountMinor: 1000,
      taxMinor: 800,
    });
    expect(subtotalMinor).toBe(10000);
    expect(totalMinor).toBe(10000 + 500 + 800 - 1000);
  });

  it('is order-independent of how shipping/tax/discount combine (pure arithmetic, no clamping)', () => {
    const { totalMinor } = computeOrderTotals({
      lines: [{ qty: 1, unitPriceMinor: 100 }],
      shippingFeeMinor: 0,
      discountMinor: 100,
      taxMinor: 0,
    });
    expect(totalMinor).toBe(0);
  });
});
