import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { gatewayFetch } from '@/lib/gateway';
import type { StorefrontCategoryDto, StorefrontProductsResponse } from '@temp-nx/api-types/catalog';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { ProductGrid } from '@/components/product/product-grid';
import { FiltersSidebar } from '@/components/product/filters-sidebar';
import { SortSelect } from '@/components/product/sort-select';
import { Pagination } from '@/components/product/pagination';

export const dynamic = 'force-dynamic';

async function getCategory(id: string): Promise<StorefrontCategoryDto | null> {
  try {
    // gatewayFetch resolves with the parsed body (or throws) — not a
    // Response, so there is no `.ok`/`.json()` to unwrap.
    const data = await gatewayFetch<StorefrontCategoryDto[]>(`/catalog/storefront/categories`);
    const category = data.find((c) => c.id === id);
    return category || null;
  } catch (error) {
    console.error('Failed to fetch category', error);
  }
  return null;
}

async function getCategoryProducts(
  categoryId: string,
  searchParams: { [key: string]: string | string[] | undefined },
  page: number,
): Promise<StorefrontProductsResponse> {
  const limit = 12;
  const params = new URLSearchParams();

  if (typeof searchParams.q === 'string') params.set('q', searchParams.q);
  if (typeof searchParams.sort === 'string') params.set('sort', searchParams.sort);
  if (typeof searchParams.marketId === 'string') params.set('marketId', searchParams.marketId);
  if (typeof searchParams.minPrice === 'string') params.set('minPrice', searchParams.minPrice);
  if (typeof searchParams.maxPrice === 'string') params.set('maxPrice', searchParams.maxPrice);
  params.set('limit', String(limit));
  params.set('offset', String((page - 1) * limit));

  params.set('categoryId', categoryId);

  try {
    // gatewayFetch resolves with the parsed body (or throws) — not a
    // Response, so there is no `.ok`/`.json()` to unwrap.
    return await gatewayFetch<StorefrontProductsResponse>(`/catalog/storefront/products?${params.toString()}`);
  } catch (error) {
    console.error('Failed to fetch products', error);
  }
  return { items: [], total: 0, limit, offset: 0 };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const category = await getCategory(id);

  if (!category) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const page = typeof resolvedSearchParams.page === 'string' ? Math.max(1, parseInt(resolvedSearchParams.page, 10) || 1) : 1;
  const productsData = await getCategoryProducts(category.id, resolvedSearchParams, page);

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
              <BreadcrumbLink asChild>
                <Link href="/products">Products</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{category.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-2">{category.name}</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <aside className="w-full md:w-64 shrink-0">
          <FiltersSidebar />
        </aside>
        
        <main className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold tracking-tight">Products</h2>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">{productsData.total} results</span>
              <SortSelect />
            </div>
          </div>
          
          <ProductGrid products={productsData.items || []} />
          
          {productsData.total > 0 && (
            <Pagination
              total={productsData.total}
              limit={productsData.limit}
              currentPage={page}
            />
          )}
        </main>
      </div>
    </div>
  );
}
