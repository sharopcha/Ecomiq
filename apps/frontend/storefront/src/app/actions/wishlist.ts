'use server';

import { gatewayFetch } from '@/lib/gateway';
import { revalidatePath } from 'next/cache';

// gatewayFetch resolves with the parsed body (or throws ApiError) — it is
// not a Response, so there is no `.ok` to check; reaching the line after
// the call means it succeeded.

export async function addWishlistItemAction(variantId: string) {
  try {
    await gatewayFetch('/crm/storefront/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId }),
    });
    revalidatePath('/account/wishlist');
    return { success: true };
  } catch (error) {
    console.error('Failed to add to wishlist', error);
    return { success: false, error: 'Failed to add to wishlist' };
  }
}

export async function removeWishlistItemAction(variantId: string) {
  try {
    await gatewayFetch(`/crm/storefront/wishlist/${variantId}`, {
      method: 'DELETE',
    });
    revalidatePath('/account/wishlist');
    return { success: true };
  } catch (error) {
    console.error('Failed to remove from wishlist', error);
    return { success: false, error: 'Failed to remove from wishlist' };
  }
}

export async function toggleWishlistAction(variantId: string) {
  try {
    await gatewayFetch('/crm/storefront/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId }),
    });
    revalidatePath('/products');
    revalidatePath(`/products/[id]`, 'page');
    return { success: true };
  } catch (error) {
    console.error('Failed to toggle wishlist', error);
    return { success: false, error: 'Failed to toggle wishlist' };
  }
}
