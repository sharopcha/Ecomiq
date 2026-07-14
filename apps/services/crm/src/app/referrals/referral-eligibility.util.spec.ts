import { isReferralCompletionEligible } from './referral-eligibility.util';

describe('isReferralCompletionEligible', () => {
  it('is eligible on exactly the first order', () => {
    expect(isReferralCompletionEligible(1)).toBe(true);
  });

  it('is not eligible before any order (0)', () => {
    expect(isReferralCompletionEligible(0)).toBe(false);
  });

  it('is not eligible on the second order', () => {
    expect(isReferralCompletionEligible(2)).toBe(false);
  });

  it('is not eligible on later orders', () => {
    expect(isReferralCompletionEligible(10)).toBe(false);
  });
});
