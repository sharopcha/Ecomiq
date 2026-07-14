/**
 * The first-order gate `ReferralsService.completeIfEligible` checks before
 * ever looking for a pending referral row — a referee's second and later
 * orders must never re-trigger completion (and can't anyway, since the
 * referral would no longer be `pending` by then, but this check runs
 * first and cheaper).
 */
export function isReferralCompletionEligible(totalOrders: number): boolean {
  return totalOrders === 1;
}
