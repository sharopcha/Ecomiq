import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/account/', '/checkout/', '/cart/', '/api/'],
    },
    sitemap: 'https://ecomiq.dev/sitemap.xml',
  };
}
