import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { gatewayFetch } from '@/lib/gateway';
import type { ProductDto } from '@temp-nx/api-types/catalog';
import { ImageGallery } from '@/components/product/image-gallery';
import { ProductActions } from '@/components/product/product-actions';
import { RatingStars } from '@/components/product/rating-stars';
import { ReviewsBlock, ReviewsBlockSkeleton } from '@/components/product/reviews-block';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import Link from 'next/link';

interface ProductPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function getProduct(id: string): Promise<ProductDto | null> {
  try {
    // gatewayFetch resolves with the parsed body (or throws) — not a
    // Response, so there is no `.ok`/`.json()` to unwrap.
    return await gatewayFetch<ProductDto>(`/catalog/storefront/products/${id}`, {
      next: { revalidate: 60 } // Cache for 60s
    });
  } catch (error) {
    console.error('Failed to fetch product', error);
  }
  return null;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  
  if (!product) {
    return { title: 'Product Not Found' };
  }

  return {
    title: product.name,
    description: product.description?.substring(0, 160) || `Buy ${product.name} on Ecomiq`,
    openGraph: {
      title: product.name,
      description: product.description?.substring(0, 160) || `Buy ${product.name} on Ecomiq`,
      type: 'article', // Since Next.js OG types are somewhat limited without next/og
      url: `https://ecomiq.dev/products/${product.id}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description: product.description?.substring(0, 160),
    }
  };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product) {
    notFound();
  }

  // Placeholder images. We don't have a gallery array on the product DTO yet, 
  // so we'll mock it if not available, or use the single imageUrl if it exists.
  const images: string[] = []; // Usually mapped from media files

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    sku: product.id,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: product.variants?.[0]?.priceMinor ? product.variants[0].priceMinor / 100 : 0,
    },
    ...(product.ratingCount > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.ratingAvg,
        reviewCount: product.ratingCount,
      }
    })
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Breadcrumbs */}
      <div className="mb-6">
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
            {product.category && (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href={`/categories/${product.category.id}`} className="capitalize">
                      {product.category.name}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            )}
            <BreadcrumbItem>
              <BreadcrumbPage className="truncate max-w-[200px] sm:max-w-xs">{product.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16">
        {/* Left Column: Gallery */}
        <div>
          <ImageGallery images={images} productName={product.name} />
        </div>

        {/* Right Column: Info & Actions */}
        <div className="flex flex-col">
          <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">{product.kind}</p>
          <h1 className="text-3xl font-bold mb-4">{product.name}</h1>
          
          <div className="mb-6">
            <RatingStars rating={product.ratingAvg} count={product.ratingCount} size="md" />
          </div>

          {product.description && (
            <p className="text-muted-foreground mb-8 leading-relaxed">
              {product.description}
            </p>
          )}

          <div className="mt-auto">
            <ProductActions product={product} />
          </div>
          
          <div className="mt-8 pt-6 border-t text-sm text-muted-foreground">
            <p>SKU: {product.sku}</p>
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <Suspense fallback={<ReviewsBlockSkeleton />}>
        <ReviewsBlock productId={product.id} />
      </Suspense>
    </div>
  );
}
