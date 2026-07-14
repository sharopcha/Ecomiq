import Link from 'next/link';
import { gatewayFetch } from '@/lib/gateway';
import type { ProductDto } from '@temp-nx/api-types/catalog';
import { formatMoney } from '@/lib/money';
import { Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface ProductRailProps {
  title: string;
  sort: string;
  limit?: number;
}

export async function ProductRail({ title, sort, limit = 4 }: ProductRailProps) {
  let products: ProductDto[] = [];

  try {
    // gatewayFetch resolves with the parsed body (or throws) — not a
    // Response, so there is no `.ok`/`.json()` to unwrap.
    const data = await gatewayFetch<{ items: ProductDto[] }>(`/catalog/storefront/products?sort=${sort}&limit=${limit}`);
    products = data.items || [];
  } catch (error) {
    console.error('Failed to fetch rail', error);
  }

  if (products.length === 0) {
    return null; // or empty state
  }

  return (
    <section className="py-12">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <Link href={`/products?sort=${sort}`} className="text-sm font-medium text-primary hover:underline">
            View All
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="group block space-y-3"
            >
              <div className="aspect-square overflow-hidden rounded-xl bg-muted relative flex items-center justify-center text-muted-foreground">
                No image
              </div>
              <div>
                {product.vendorName && <p className="text-xs text-muted-foreground mb-1">{product.vendorName}</p>}
                <h3 className="font-medium line-clamp-1">{product.name}</h3>
                <div className="flex items-center justify-between mt-1">
                  <p className="font-semibold">{formatMoney(product.priceMinor, 'USD')}</p>
                  {product.ratingAvg > 0 && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Star className="w-3 h-3 fill-primary text-primary mr-1" />
                      <span>{product.ratingAvg.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProductRailSkeleton() {
  return (
    <section className="py-12">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-[200px]" />
          <Skeleton className="h-4 w-[60px]" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <div className="space-y-1">
                <Skeleton className="h-3 w-[80px]" />
                <Skeleton className="h-5 w-full" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-5 w-[60px]" />
                <Skeleton className="h-4 w-[40px]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
