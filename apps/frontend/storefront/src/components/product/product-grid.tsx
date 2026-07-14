import type { ProductDto } from '@temp-nx/api-types/catalog';
import { ProductCard } from './product-card';
import { Skeleton } from '@/components/ui/skeleton';

export function ProductGrid({ products }: { products: ProductDto[] }) {
  if (products.length === 0) {
    return (
      <div className="py-20 text-center border rounded-lg bg-muted/20">
        <h3 className="text-xl font-semibold mb-2">No products found</h3>
        <p className="text-muted-foreground">Try adjusting your filters or search query.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
      {Array.from({ length: 12 }).map((_, i) => (
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
  );
}
