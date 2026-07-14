import { LoyaltyTier } from '../entities/loyalty-account.entity';
import { calculateEarnedPoints, tierForPoints } from './loyalty-math.util';

describe('calculateEarnedPoints', () => {
  it('earns floor(totalMinor / 100) * earnRate points', () => {
    expect(calculateEarnedPoints(15_000, 1)).toBe(150);
  });

  it('floors a partial hundred rather than rounding', () => {
    expect(calculateEarnedPoints(15_099, 1)).toBe(150);
  });

  it('scales with a non-default earn rate', () => {
    expect(calculateEarnedPoints(10_000, 3)).toBe(300);
  });

  it('returns 0 for an order under the minimum unit (100 minor)', () => {
    expect(calculateEarnedPoints(99, 1)).toBe(0);
  });
});

describe('tierForPoints', () => {
  const silver = 500;
  const gold = 2000;

  it('returns bronze below the silver threshold', () => {
    expect(tierForPoints(499, silver, gold)).toBe(LoyaltyTier.Bronze);
  });

  it('returns silver at exactly the silver threshold', () => {
    expect(tierForPoints(500, silver, gold)).toBe(LoyaltyTier.Silver);
  });

  it('returns silver between the two thresholds', () => {
    expect(tierForPoints(1_999, silver, gold)).toBe(LoyaltyTier.Silver);
  });

  it('returns gold at exactly the gold threshold', () => {
    expect(tierForPoints(2_000, silver, gold)).toBe(LoyaltyTier.Gold);
  });

  it('returns gold above the gold threshold', () => {
    expect(tierForPoints(10_000, silver, gold)).toBe(LoyaltyTier.Gold);
  });
});
