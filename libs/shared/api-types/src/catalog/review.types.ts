export interface ProductReviewCustomerDto {
  id: string;
  fullName: string;
}

/**
 * `GET /crm/storefront/products/:id/reviews` — served by crm-service but
 * modeling a catalog concept (product reviews), grouped here per the
 * shared-types migration plan. Cursor-paginated (crm's `paginate()`
 * helper) — there is no `total`/`page`, and the query param is `cursor`,
 * not `page` (the old frontend `?page=` query param was silently ignored).
 */
export interface ProductReviewDto {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: string;
  customer: ProductReviewCustomerDto;
}

export interface ProductReviewsResponse {
  items: ProductReviewDto[];
  nextCursor: string | null;
}
