import { computePoTotals } from './po-totals.util';

describe('computePoTotals', () => {
  it('sums qty * unitCostMinor across lines with no tax', () => {
    const result = computePoTotals([
      { qty: 2, unitCostMinor: 500 },
      { qty: 3, unitCostMinor: 1000 },
    ]);
    expect(result).toEqual({ subtotalMinor: 4000, totalMinor: 4000 });
  });

  it('applies a percentage taxRate rounded to the nearest minor unit', () => {
    const result = computePoTotals([{ qty: 1, unitCostMinor: 1000 }], 10);
    expect(result).toEqual({ subtotalMinor: 1000, totalMinor: 1100 });
  });

  it('rounds tax to the nearest cent rather than truncating', () => {
    // subtotal 333, taxRate 7.5% -> 24.975 -> rounds to 25
    const result = computePoTotals([{ qty: 1, unitCostMinor: 333 }], 7.5);
    expect(result.totalMinor).toBe(333 + 25);
  });

  it('treats a taxRate of 0 the same as no taxRate (falsy short-circuit)', () => {
    const withZero = computePoTotals([{ qty: 1, unitCostMinor: 1000 }], 0);
    const withNull = computePoTotals([{ qty: 1, unitCostMinor: 1000 }], null);
    const withUndefined = computePoTotals([{ qty: 1, unitCostMinor: 1000 }]);
    expect(withZero).toEqual({ subtotalMinor: 1000, totalMinor: 1000 });
    expect(withNull).toEqual({ subtotalMinor: 1000, totalMinor: 1000 });
    expect(withUndefined).toEqual({ subtotalMinor: 1000, totalMinor: 1000 });
  });

  it('returns a zero subtotal for an empty line list', () => {
    expect(computePoTotals([], 15)).toEqual({ subtotalMinor: 0, totalMinor: 0 });
  });

  it('handles multiple lines with varying quantities and a tax rate together', () => {
    const result = computePoTotals(
      [
        { qty: 4, unitCostMinor: 250 },
        { qty: 1, unitCostMinor: 999 },
      ],
      20,
    );
    // subtotal = 1000 + 999 = 1999; tax = round(1999 * 20 / 100) = 400
    expect(result).toEqual({ subtotalMinor: 1999, totalMinor: 2399 });
  });
});
