import { checkAutoDraftEligibility } from './auto-draft-eligibility.util';

describe('checkAutoDraftEligibility', () => {
  it('is eligible when method is purchase_order and a preferredSupplierId is set', () => {
    expect(checkAutoDraftEligibility({ method: 'purchase_order', preferredSupplierId: 'supplier_1' })).toEqual({
      eligible: true,
    });
  });

  it('is ineligible when method is restock_alert', () => {
    expect(checkAutoDraftEligibility({ method: 'restock_alert', preferredSupplierId: 'supplier_1' })).toEqual({
      eligible: false,
      reason: 'NOT_PURCHASE_ORDER_METHOD',
    });
  });

  it('is ineligible when preferredSupplierId is null', () => {
    expect(checkAutoDraftEligibility({ method: 'purchase_order', preferredSupplierId: null })).toEqual({
      eligible: false,
      reason: 'NO_PREFERRED_SUPPLIER',
    });
  });

  it('is ineligible when preferredSupplierId is absent entirely', () => {
    expect(checkAutoDraftEligibility({ method: 'purchase_order' })).toEqual({
      eligible: false,
      reason: 'NO_PREFERRED_SUPPLIER',
    });
  });

  it('method mismatch is checked before the supplier check (wrong method with no supplier is still NOT_PURCHASE_ORDER_METHOD)', () => {
    expect(checkAutoDraftEligibility({ method: 'restock_alert', preferredSupplierId: null })).toEqual({
      eligible: false,
      reason: 'NOT_PURCHASE_ORDER_METHOD',
    });
  });
});
