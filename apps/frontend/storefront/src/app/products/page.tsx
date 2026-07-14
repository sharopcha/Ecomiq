import { Suspense } from 'react';
import { Metadata } from 'next';
import { gatewayFetch } from '@/lib/gateway';
import type { StorefrontProductsResponse } from '@temp-nx/api-types/catalog';
import { ProductGrid, ProductGridSkeleton } from '@/components/product/product-grid';
import { FiltersSidebar } from '@/components/product/filters-sidebar';
import { SortSelect } from '@/components/product/sort-select';
import { Pagination } from '@/components/product/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'All Products',
  description: 'Browse our entire collection of products.',
};

export const dynamic = 'force-dynamic'; // relies on searchParams

type ProductsSearchParams = { [key: string]: string | string[] | undefined };

async function ProductsContent({ searchParams }: { searchParams: ProductsSearchParams }) {
  const limit = 12;
  const page = typeof searchParams.page === 'string' ? Math.max(1, parseInt(searchParams.page, 10) || 1) : 1;

  const params = new URLSearchParams();
  if (typeof searchParams.q === 'string') params.set('q', searchParams.q);
  if (typeof searchParams.sort === 'string') params.set('sort', searchParams.sort);
  if (typeof searchParams.categoryId === 'string') params.set('categoryId', searchParams.categoryId);
  if (typeof searchParams.marketId === 'string') params.set('marketId', searchParams.marketId);
  if (typeof searchParams.minPrice === 'string') params.set('minPrice', searchParams.minPrice);
  if (typeof searchParams.maxPrice === 'string') params.set('maxPrice', searchParams.maxPrice);
  params.set('limit', String(limit));
  params.set('offset', String((page - 1) * limit));

  let data: StorefrontProductsResponse = { items: [], total: 0, limit, offset: 0 };

  try {
    // gatewayFetch resolves with the parsed body (or throws ApiError) — it
    // is not a Response, so there is no `.ok`/`.json()` to unwrap here (same
    // bug fixed in app/actions/orders.ts's createOrderAction — this page was
    // silently always showing zero products).
    data = await gatewayFetch<StorefrontProductsResponse>(`/catalog/storefront/products?${params.toString()}`);
  } catch (error) {
    console.error('Failed to fetch products', error);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {searchParams.q ? `Search results for "${searchParams.q}"` : 'All Products'}
        </h1>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-muted-foreground">{data.total} results</span>
          <SortSelect />
        </div>
      </div>

      <ProductGrid products={data.items || []} />

      {data.total > 0 && (
        <Pagination
          total={data.total}
          limit={data.limit}
          currentPage={page}
        />
      )}
    </>
  );
}

function ProductsHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between mb-6">
      <Skeleton className="h-8 w-[200px]" />
      <Skeleton className="h-8 w-[250px]" />
    </div>
  );
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<ProductsSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Products</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <aside className="w-full md:w-64 shrink-0">
          <FiltersSidebar />
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <Suspense fallback={<><ProductsHeaderSkeleton /><ProductGridSkeleton /></>}>
            <ProductsContent searchParams={resolvedSearchParams} />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
