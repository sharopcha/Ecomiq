import { gatewayFetch } from '@/lib/gateway';
import { WishlistGrid } from './wishlist-grid';
import type { CartValidateResponseDto, CartLineResponseDto } from '@temp-nx/api-types/catalog';
import type { WishlistItemDto } from '@temp-nx/api-types/crm';

async function getWishlist(): Promise<CartLineResponseDto[]> {
  try {
    // gatewayFetch resolves with the parsed body (or throws) — not a
    // Response, so there is no `.ok`/`.json()` to unwrap.
    const items = await gatewayFetch<WishlistItemDto[]>('/crm/storefront/wishlist', { cache: 'no-store' });

    if (items.length > 0) {
      // Hydrate using cart/validate
      const validated = await gatewayFetch<CartValidateResponseDto>('/catalog/storefront/cart/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: items.map((i) => ({ variantId: i.variantId, qty: 1 }))
        })
      });
      return validated.lines;
    }
  } catch (error) {
    console.error('Failed to fetch wishlist', error);
  }
  return [];
}

export default async function WishlistPage() {
  const wishlistItems = await getWishlist();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Wishlist</h2>
        <p className="text-muted-foreground">Products you have saved for later.</p>
      </div>
      
      <WishlistGrid initialItems={wishlistItems} />
    </div>
  );
}
