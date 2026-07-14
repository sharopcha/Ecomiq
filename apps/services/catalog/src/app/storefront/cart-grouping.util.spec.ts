import { groupCartLines } from './cart-grouping.util';
import { CartLineResponseDto } from './dto/cart-validate.dto';

describe('groupCartLines', () => {
  it('should group lines by storeId and sum subtotals', () => {
    const lines: CartLineResponseDto[] = [
      { storeId: 'store-1', variantId: 'v1', qty: 2, unitPriceMinor: 100, problems: [], currency: 'USD', productId: 'p1', name: 'N1', optionSummary: '', imageUrl: null },
      { storeId: 'store-1', variantId: 'v2', qty: 1, unitPriceMinor: 50, problems: [], currency: 'USD', productId: 'p2', name: 'N2', optionSummary: '', imageUrl: null },
      { storeId: 'store-2', variantId: 'v3', qty: 3, unitPriceMinor: 200, problems: [], currency: 'USD', productId: 'p3', name: 'N3', optionSummary: '', imageUrl: null },
    ];

    const groups = groupCartLines(lines);

    expect(groups).toHaveLength(2);
    expect(groups).toEqual([
      { storeId: 'store-1', lineVariantIds: ['v1', 'v2'], subtotalMinor: 250 },
      { storeId: 'store-2', lineVariantIds: ['v3'], subtotalMinor: 600 },
    ]);
  });

  it('should ignore lines with not_found or inactive problems for subtotal calculation', () => {
    const lines: CartLineResponseDto[] = [
      { storeId: 'store-1', variantId: 'v1', qty: 2, unitPriceMinor: 100, problems: [], currency: 'USD', productId: 'p1', name: 'N1', optionSummary: '', imageUrl: null },
      { storeId: 'store-1', variantId: 'v2', qty: 1, unitPriceMinor: 50, problems: ['inactive'], currency: 'USD', productId: 'p2', name: 'N2', optionSummary: '', imageUrl: null },
      { storeId: 'store-1', variantId: 'v3', qty: 1, unitPriceMinor: 50, problems: ['not_found'], currency: 'USD', productId: 'p3', name: 'N3', optionSummary: '', imageUrl: null },
      { storeId: 'store-1', variantId: 'v4', qty: 1, unitPriceMinor: 50, problems: ['price_changed'], currency: 'USD', productId: 'p4', name: 'N4', optionSummary: '', imageUrl: null }, // price_changed is valid for subtotal
    ];

    const groups = groupCartLines(lines);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(
      { storeId: 'store-1', lineVariantIds: ['v1', 'v2', 'v3', 'v4'], subtotalMinor: 250 }
    );
  });
});
