import Link from 'next/link';
import { Star } from 'lucide-react';
import type { ProductDto } from '@temp-nx/api-types/catalog';
import { formatMoney } from '@/lib/money';

export function ProductCard({ product }: { product: ProductDto }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="group block space-y-3"
    >
      <div className="aspect-square overflow-hidden rounded-xl bg-muted relative flex items-center justify-center text-muted-foreground">
        No image
      </div>
      <div>
        {product.vendorName && <p className="text-xs text-muted-foreground mb-1">{product.vendorName}</p>}
        <h3 className="font-medium line-clamp-1 group-hover:text-primary transition-colors">{product.name}</h3>
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
  );
}
