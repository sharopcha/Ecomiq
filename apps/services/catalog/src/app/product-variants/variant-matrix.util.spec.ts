import {
  buildVariantSku,
  cartesianProduct,
  combinationKey,
  validateCombinationCoverage,
} from './variant-matrix.util';

describe('cartesianProduct', () => {
  it('expands a single array as-is', () => {
    expect(cartesianProduct([['S', 'M', 'L']])).toEqual([['S'], ['M'], ['L']]);
  });

  it('expands the cross product of two arrays in row-major order', () => {
    expect(cartesianProduct([['S', 'M'], ['Red', 'Blue']])).toEqual([
      ['S', 'Red'],
      ['S', 'Blue'],
      ['M', 'Red'],
      ['M', 'Blue'],
    ]);
  });

  it('expands three arrays', () => {
    const result = cartesianProduct([['S', 'M'], ['Red'], ['Cotton', 'Wool']]);
    expect(result).toHaveLength(4);
    expect(result).toEqual([
      ['S', 'Red', 'Cotton'],
      ['S', 'Red', 'Wool'],
      ['M', 'Red', 'Cotton'],
      ['M', 'Red', 'Wool'],
    ]);
  });

  it('returns a single empty combination for zero input arrays', () => {
    expect(cartesianProduct([])).toEqual([[]]);
  });

  it('returns no combinations when any array is empty', () => {
    expect(cartesianProduct([['S', 'M'], []])).toEqual([]);
  });
});

describe('combinationKey', () => {
  it('is order-independent', () => {
    expect(combinationKey(['a', 'b', 'c'])).toBe(combinationKey(['c', 'a', 'b']));
  });

  it('differs for different sets of ids', () => {
    expect(combinationKey(['a', 'b'])).not.toBe(combinationKey(['a', 'c']));
  });

  it('handles the empty array (product with no options)', () => {
    expect(combinationKey([])).toBe('');
  });

  it('does not mutate the input array', () => {
    const ids = ['b', 'a'];
    combinationKey(ids);
    expect(ids).toEqual(['b', 'a']);
  });
});

describe('buildVariantSku', () => {
  it('uses the product sku as the base when set', () => {
    expect(buildVariantSku('MAC', 'some-product-id', 1)).toBe('MAC-001');
  });

  it('trims whitespace on the base sku', () => {
    expect(buildVariantSku('  MAC  ', 'some-product-id', 2)).toBe('MAC-002');
  });

  it('falls back to a slice of the product id when sku is null', () => {
    expect(buildVariantSku(null, 'abcdefgh12345678', 1)).toBe('12345678-001');
  });

  it('falls back to a slice of the product id when sku is undefined', () => {
    expect(buildVariantSku(undefined, 'abcdefgh12345678', 1)).toBe('12345678-001');
  });

  it('falls back when sku is an empty/whitespace-only string', () => {
    expect(buildVariantSku('   ', 'abcdefgh12345678', 3)).toBe('12345678-003');
  });

  it('zero-pads the sequence number to 3 digits', () => {
    expect(buildVariantSku('MAC', 'id', 42)).toBe('MAC-042');
    expect(buildVariantSku('MAC', 'id', 1234)).toBe('MAC-1234');
  });

  it('uppercases the fallback id slice', () => {
    expect(buildVariantSku(null, 'abc123ef', 1)).toBe('ABC123EF-001');
  });
});

describe('validateCombinationCoverage', () => {
  it('accepts an empty selection for a product with zero options', () => {
    expect(validateCombinationCoverage([], [])).toEqual({ ok: true });
  });

  it('rejects a non-empty selection for a product with zero options', () => {
    const result = validateCombinationCoverage([], ['v1']);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/no options defined/i);
    }
  });

  it('accepts exactly one value per option', () => {
    const options = [
      { id: 'opt-size', values: [{ id: 'v-s' }, { id: 'v-m' }] },
      { id: 'opt-color', values: [{ id: 'v-red' }, { id: 'v-blue' }] },
    ];
    expect(validateCombinationCoverage(options, ['v-s', 'v-red'])).toEqual({ ok: true });
  });

  it('rejects a value id that does not belong to any option', () => {
    const options = [{ id: 'opt-size', values: [{ id: 'v-s' }] }];
    const result = validateCombinationCoverage(options, ['unknown-id']);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/does not belong to this product/i);
    }
  });

  it('rejects two values from the same option', () => {
    const options = [{ id: 'opt-size', values: [{ id: 'v-s' }, { id: 'v-m' }] }];
    const result = validateCombinationCoverage(options, ['v-s', 'v-m']);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/one value per option/i);
    }
  });

  it('rejects incomplete coverage (missing an option)', () => {
    const options = [
      { id: 'opt-size', values: [{ id: 'v-s' }] },
      { id: 'opt-color', values: [{ id: 'v-red' }] },
    ];
    const result = validateCombinationCoverage(options, ['v-s']);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/exactly one value for each/i);
    }
  });

  it('rejects an empty selection when the product has options', () => {
    const options = [{ id: 'opt-size', values: [{ id: 'v-s' }] }];
    const result = validateCombinationCoverage(options, []);
    expect(result.ok).toBe(false);
  });
});
