import { pricingToMinor } from './pricing.util';

describe('pricingToMinor', () => {
  it('converts all five pricing fields when present', () => {
    expect(
      pricingToMinor({
        price: 19.99,
        compareAtPrice: 24.99,
        cost: 5.5,
        wholesaleMin: 10,
        wholesaleMax: 15.25,
      }),
    ).toEqual({
      priceMinor: 1999,
      compareAtMinor: 2499,
      costMinor: 550,
      wholesaleMinMinor: 1000,
      wholesaleMaxMinor: 1525,
    });
  });

  it('omits fields that are undefined, rather than nulling them out', () => {
    const result = pricingToMinor({ price: 10 });
    expect(result).toEqual({ priceMinor: 1000 });
    expect(result).not.toHaveProperty('compareAtMinor');
    expect(result).not.toHaveProperty('costMinor');
  });

  it('returns an empty object when nothing is provided (no-op update)', () => {
    expect(pricingToMinor({})).toEqual({});
  });

  it('converts a zero price (falsy but defined) correctly', () => {
    expect(pricingToMinor({ price: 0 })).toEqual({ priceMinor: 0 });
  });

  it('rounds fractional cents the same way toMinorUnits does', () => {
    // 19.999 * 100 = 1999.9000000000003 in floating point -> rounds to 2000
    expect(pricingToMinor({ price: 19.999 })).toEqual({ priceMinor: 2000 });
  });
});
