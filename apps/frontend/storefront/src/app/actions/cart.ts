'use server';

import { gatewayFetch } from '@/lib/gateway';
import { CartItem, ValidatedCart } from '@/components/cart/cart-context';

export async function validateCartAction(items: CartItem[]): Promise<ValidatedCart | null> {
  if (!items || items.length === 0) {
    return { lines: [], groups: [] };
  }

  try {
    // gatewayFetch resolves with the parsed body (or throws) — not a
    // Response, so there is no `.ok`/`.json()` to unwrap.
    return await gatewayFetch<ValidatedCart>('/catalog/storefront/cart/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: items }),
    });
  } catch (error) {
    console.error('Failed to validate cart', error);
    return null;
  }
}
