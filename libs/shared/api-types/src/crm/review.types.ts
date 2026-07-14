/** `POST /crm/storefront/reviews` request body. */
export interface CreateStorefrontReviewRequestDto {
  productId: string;
  orderId: string;
  rating: number;
  title?: string;
  body?: string;
  mediaFileIds?: string[];
}
