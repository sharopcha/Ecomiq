/**
 * Contract test for the checked-in ts-proto output — same reasoning as
 * `reservation-contract.spec.ts`/`payment-contract.spec.ts`: mostly a
 * compile-time check, plus a real
 * wire round-trip to catch field numbering drift and confirm the `oneof`
 * valid/failure split stays mutually exclusive.
 */
import {
  DiscountKind,
  DiscountValidationFailureReason,
  ValidateDiscountRequest,
  ValidateDiscountResponse,
} from './generated/marketing/v1/discount';

describe('DiscountService generated contract', () => {
  it('round-trips a ValidateDiscountRequest with an optional customerId', () => {
    const original: ValidateDiscountRequest = {
      storeId: 'store_1',
      code: 'SAVE10',
      customerId: 'customer_1',
      subtotalMinor: 10000,
      currency: 'USD',
    };
    const decoded = ValidateDiscountRequest.decode(ValidateDiscountRequest.encode(original).finish());
    expect(decoded).toEqual(original);
  });

  it('round-trips a request that omits customerId', () => {
    const original: ValidateDiscountRequest = {
      storeId: 'store_1',
      code: 'SAVE10',
      subtotalMinor: 10000,
      currency: 'USD',
    };
    const decoded = ValidateDiscountRequest.decode(ValidateDiscountRequest.encode(original).finish());
    expect(decoded.customerId).toBeUndefined();
    expect(decoded).toEqual(original);
  });

  it('round-trips a successful validation', () => {
    const original: ValidateDiscountResponse = {
      valid: { discountId: 'discount_1', discountMinor: 1000, kind: DiscountKind.PERCENTAGE },
    };
    const decoded = ValidateDiscountResponse.decode(ValidateDiscountResponse.encode(original).finish());
    expect(decoded.valid).toEqual(original.valid);
    expect(decoded.failure).toBeUndefined();
  });

  it('round-trips a typed failure via the oneof, not a thrown error', () => {
    const original: ValidateDiscountResponse = {
      failure: {
        reason: DiscountValidationFailureReason.USAGE_LIMIT_REACHED,
        message: 'usage limit reached',
      },
    };
    const decoded = ValidateDiscountResponse.decode(ValidateDiscountResponse.encode(original).finish());
    expect(decoded.failure).toEqual(original.failure);
    expect(decoded.valid).toBeUndefined();
  });
});
