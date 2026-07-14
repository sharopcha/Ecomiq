import { Suspense } from 'react';
import { Hero } from '@/components/home/hero';
import { CategoryTiles } from '@/components/home/category-tiles';
import { ProductRail, ProductRailSkeleton } from '@/components/home/product-rail';
import { MarketsStrip, MarketsStripSkeleton } from '@/components/home/markets-strip';

// Force revalidation based on plan §4.2 caching strategy if needed,
// but for Next.js app router we can use export const revalidate = 60;
export const revalidate = 60; // revalidate every minute

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <Hero />
      <CategoryTiles />
      
      <Suspense fallback={<ProductRailSkeleton />}>
        <ProductRail title="New Arrivals" sort="newest" />
      </Suspense>
      
      <Suspense fallback={<MarketsStripSkeleton />}>
        <MarketsStrip />
      </Suspense>

      <Suspense fallback={<ProductRailSkeleton />}>
        <ProductRail title="Top Rated" sort="rating" />
      </Suspense>
    </div>
  );
}
