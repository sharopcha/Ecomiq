import { MetadataRoute } from 'next';
import { gatewayFetch } from '@/lib/gateway';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://ecomiq.dev';

  // Fetch static routes
  const routes: MetadataRoute.Sitemap = ['', '/products', '/markets', '/about', '/terms'].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: route === '' ? 1 : 0.8,
  }));

  try {
    // gatewayFetch resolves with the parsed body (or throws) — not a
    // Response, so there is no `.ok`/`.json()` to unwrap (same bug fixed
    // throughout this app — see app/actions/orders.ts's createOrderAction).
    const productsData = await gatewayFetch<{ items: { id: string }[] }>('/catalog/storefront/products?limit=1000');
    const productRoutes = productsData.items.map((product) => ({
      url: `${baseUrl}/products/${product.id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
    routes.push(...productRoutes);

    const categoriesData = await gatewayFetch<{ items: { id: string }[] }>('/catalog/storefront/categories?limit=100');
    const categoryRoutes = categoriesData.items.map((category) => ({
      url: `${baseUrl}/categories/${category.id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
    routes.push(...categoryRoutes);
  } catch (error) {
    console.error('Error generating sitemap', error);
  }

  return routes;
}
