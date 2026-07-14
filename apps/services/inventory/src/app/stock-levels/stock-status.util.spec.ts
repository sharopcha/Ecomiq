import { computeStockStatus } from './stock-status.util';

describe('computeStockStatus', () => {
  it('returns "out" when available is zero', () => {
    expect(computeStockStatus(0, 10)).toBe('out');
  });

  it('returns "out" when available is negative (over-reserved edge case)', () => {
    expect(computeStockStatus(-3, 10)).toBe('out');
  });

  it('returns "low" when available is at the lowThreshold exactly', () => {
    expect(computeStockStatus(10, 10)).toBe('low');
  });

  it('returns "low" when available is below the lowThreshold but still positive', () => {
    expect(computeStockStatus(4, 10)).toBe('low');
  });

  it('returns "high" when available is above the lowThreshold', () => {
    expect(computeStockStatus(11, 10)).toBe('high');
  });

  it('returns "high" for a positive available with no lowThreshold set (null = not tracked)', () => {
    expect(computeStockStatus(1, null)).toBe('high');
  });

  it('still returns "out" for a zero/negative available even with no lowThreshold set', () => {
    expect(computeStockStatus(0, null)).toBe('out');
  });
});
