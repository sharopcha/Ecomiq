import { validateBundleItems } from './bundle-items.util';

describe('validateBundleItems', () => {
  it('rejects an empty item list', () => {
    const result = validateBundleItems([]);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/at least one item/i);
    }
  });

  it('accepts a single valid item', () => {
    expect(validateBundleItems([{ variantId: 'v1', qty: 1 }])).toEqual({ ok: true });
  });

  it('accepts multiple distinct variants', () => {
    expect(
      validateBundleItems([
        { variantId: 'v1', qty: 1 },
        { variantId: 'v2', qty: 3 },
      ]),
    ).toEqual({ ok: true });
  });

  it('rejects a duplicate variantId', () => {
    const result = validateBundleItems([
      { variantId: 'v1', qty: 1 },
      { variantId: 'v1', qty: 2 },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/appears more than once/i);
    }
  });

  it('rejects qty of zero', () => {
    const result = validateBundleItems([{ variantId: 'v1', qty: 0 }]);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/positive integer/i);
    }
  });

  it('rejects a negative qty', () => {
    const result = validateBundleItems([{ variantId: 'v1', qty: -1 }]);
    expect(result.ok).toBe(false);
  });

  it('rejects a non-integer qty', () => {
    const result = validateBundleItems([{ variantId: 'v1', qty: 1.5 }]);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/positive integer/i);
    }
  });

  it('checks duplicates before qty validity (first bad item wins, in order)', () => {
    // v1 appears twice; the second occurrence is the duplicate hit, even
    // though it also happens to have a bad qty — duplicate check runs first.
    const result = validateBundleItems([
      { variantId: 'v1', qty: 1 },
      { variantId: 'v1', qty: -5 },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/appears more than once/i);
    }
  });
});
