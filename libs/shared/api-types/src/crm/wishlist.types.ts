/** Raw `GET /crm/storefront/wishlist` item — just a variant reference, no product/pricing detail (see catalog's CartLineResponseDto for the hydrated shape used for display). */
export interface WishlistItemDto {
  id: string;
  variantId: string;
  createdAt: string;
}

export interface AddWishlistItemRequestDto {
  variantId: string;
}
