import { Discount, DiscountKind, DiscountStatus } from '../entities/discount.entity';
import { validateDiscount } from './validate-discount.util';

const NOW = new Date('2026-07-09T12:00:00.000Z');

function baseDiscount(overrides: Partial<Discount> = {}): Discount {
  return {
    id: 'discount_1',
    storeId: 'store_1',
    createdAt: NOW,
    updatedAt: NOW,
    code: 'SAVE10',
    kind: DiscountKind.Percentage,
    value: 1000, // 10%
    usageLimit: null,
    usageCount: 0,
    oncePerCustomer: false,
    startsAt: null,
    endsAt: null,
    status: DiscountStatus.Active,
    minSubtotalMinor: null,
    ...overrides,
  } as Discount;
}

describe('validateDiscount', () => {
  it('returns NOT_FOUND for a null discount', () => {
    const result = validateDiscount(null, { now: NOW, subtotalMinor: 1000, priorCustomerUsageCount: 0 });
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.reason).toBe('NOT_FOUND');
  });

  it.each([DiscountStatus.Draft, DiscountStatus.Expired, DiscountStatus.Archived])(
    'returns INACTIVE for status %s',
    (status) => {
      const result = validateDiscount(baseDiscount({ status }), {
        now: NOW,
        subtotalMinor: 1000,
        priorCustomerUsageCount: 0,
      });
      expect(result.valid === false && result.reason).toBe('INACTIVE');
    },
  );

  it('returns NOT_STARTED before startsAt', () => {
    const result = validateDiscount(
      baseDiscount({ startsAt: new Date('2026-08-01T00:00:00.000Z') }),
      { now: NOW, subtotalMinor: 1000, priorCustomerUsageCount: 0 },
    );
    expect(result.valid === false && result.reason).toBe('NOT_STARTED');
  });

  it('returns EXPIRED after endsAt', () => {
    const result = validateDiscount(
      baseDiscount({ endsAt: new Date('2026-01-01T00:00:00.000Z') }),
      { now: NOW, subtotalMinor: 1000, priorCustomerUsageCount: 0 },
    );
    expect(result.valid === false && result.reason).toBe('EXPIRED');
  });

  it('returns USAGE_LIMIT_REACHED once usageCount meets usageLimit', () => {
    const result = validateDiscount(baseDiscount({ usageLimit: 5, usageCount: 5 }), {
      now: NOW,
      subtotalMinor: 1000,
      priorCustomerUsageCount: 0,
    });
    expect(result.valid === false && result.reason).toBe('USAGE_LIMIT_REACHED');
  });

  it('returns ONCE_PER_CUSTOMER when the customer has already used it', () => {
    const result = validateDiscount(baseDiscount({ oncePerCustomer: true }), {
      now: NOW,
      customerId: 'customer_1',
      subtotalMinor: 1000,
      priorCustomerUsageCount: 1,
    });
    expect(result.valid === false && result.reason).toBe('ONCE_PER_CUSTOMER');
  });

  it('does not apply ONCE_PER_CUSTOMER when no customerId is supplied', () => {
    const result = validateDiscount(baseDiscount({ oncePerCustomer: true }), {
      now: NOW,
      subtotalMinor: 1000,
      priorCustomerUsageCount: 0,
    });
    expect(result.valid).toBe(true);
  });

  it('returns MIN_SUBTOTAL_NOT_MET below the floor', () => {
    const result = validateDiscount(baseDiscount({ minSubtotalMinor: 5000 }), {
      now: NOW,
      subtotalMinor: 1000,
      priorCustomerUsageCount: 0,
    });
    expect(result.valid === false && result.reason).toBe('MIN_SUBTOTAL_NOT_MET');
  });

  it('computes a percentage discount from basis points, capped at the subtotal', () => {
    const result = validateDiscount(baseDiscount({ kind: DiscountKind.Percentage, value: 1000 }), {
      now: NOW,
      subtotalMinor: 10000,
      priorCustomerUsageCount: 0,
    });
    expect(result.valid).toBe(true);
    expect(result.valid === true && result.discountMinor).toBe(1000); // 10% of 10000
  });

  it('computes a fixed_amount discount, capped at the subtotal', () => {
    const result = validateDiscount(
      baseDiscount({ kind: DiscountKind.FixedAmount, value: 5000 }),
      { now: NOW, subtotalMinor: 3000, priorCustomerUsageCount: 0 },
    );
    expect(result.valid).toBe(true);
    expect(result.valid === true && result.discountMinor).toBe(3000); // capped, not 5000
  });

  it('computes free_shipping as 0 (eligibility only)', () => {
    const result = validateDiscount(baseDiscount({ kind: DiscountKind.FreeShipping, value: 0 }), {
      now: NOW,
      subtotalMinor: 3000,
      priorCustomerUsageCount: 0,
    });
    expect(result.valid).toBe(true);
    expect(result.valid === true && result.discountMinor).toBe(0);
  });
});
