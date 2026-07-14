import { LoyaltyTier } from '../entities/loyalty-account.entity';

/** `floor(totalMinor / 100) * earnRate` — the accrual math `LoyaltyService.accrueForOrder` runs per placed order. */
export function calculateEarnedPoints(totalMinor: number, earnRate: number): number {
  return Math.floor(totalMinor / 100) * earnRate;
}

/** Threshold lookup, gold checked before silver so an account at/above both lands on the higher tier. */
export function tierForPoints(points: number, silverThreshold: number, goldThreshold: number): LoyaltyTier {
  if (points >= goldThreshold) return LoyaltyTier.Gold;
  if (points >= silverThreshold) return LoyaltyTier.Silver;
  return LoyaltyTier.Bronze;
}
