import { gatewayFetch } from '@/lib/gateway';
import type { ProductReviewsResponse } from '@temp-nx/api-types/catalog';
import { RatingStars } from './rating-stars';
import { Skeleton } from '@/components/ui/skeleton';

async function ReviewsList({ productId }: { productId: string }) {
  let data: ProductReviewsResponse = { items: [], nextCursor: null };

  try {
    // The reviews endpoint is cursor-paginated (see ProductReviewsResponse) —
    // there is no page-number param, so this always fetches the first page.
    // gatewayFetch resolves with the parsed body (or throws) — not a
    // Response, so there is no `.ok`/`.json()` to unwrap.
    data = await gatewayFetch<ProductReviewsResponse>(`/crm/storefront/products/${productId}/reviews?limit=10`);
  } catch (error) {
    console.error('Failed to fetch reviews', error);
  }

  if (data.items.length === 0) {
    return <p className="text-muted-foreground">No reviews yet for this product.</p>;
  }

  return (
    <div className="space-y-6">
      {data.items.map((review) => (
        <div key={review.id} className="border-b pb-6 last:border-0 last:pb-0">
          <div className="flex items-center justify-between mb-2">
            <RatingStars rating={review.rating} size="sm" />
            <span className="text-xs text-muted-foreground">
              {new Date(review.createdAt).toLocaleDateString()}
            </span>
          </div>
          <h4 className="font-semibold mb-1">{review.title || 'Review'}</h4>
          {review.body && <p className="text-sm text-foreground/90 mb-2">{review.body}</p>}
          <p className="text-xs text-muted-foreground">By {review.customer.fullName}</p>
        </div>
      ))}
      {/* Pagination controls for reviews could go here */}
    </div>
  );
}

export function ReviewsBlockSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3 pb-6 border-b">
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-5 w-[200px]" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ReviewsBlock({ productId }: { productId: string }) {
  return (
    <section className="mt-16 pt-10 border-t">
      <h2 className="text-2xl font-bold mb-8">Customer Reviews</h2>
      <ReviewsList productId={productId} />
    </section>
  );
}
