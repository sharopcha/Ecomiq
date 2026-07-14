import { Metadata } from 'next';
import Link from 'next/link';
import { gatewayFetch } from '@/lib/gateway';
import type { PublicMarketDto, MarketsListResponse } from '@temp-nx/api-types/identity';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Markets | Ecomiq',
  description: 'Browse all available markets on Ecomiq',
};

async function getMarkets(): Promise<PublicMarketDto[]> {
  try {
    // gatewayFetch resolves with the parsed body (or throws) — not a
    // Response, so there is no `.ok`/`.json()` to unwrap.
    const data = await gatewayFetch<MarketsListResponse>('/markets', { next: { revalidate: 300 } });
    return data.markets || [];
  } catch (error) {
    console.error('Failed to fetch markets', error);
  }
  return [];
}

export default async function MarketsPage() {
  const markets = await getMarkets();

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
              <BreadcrumbPage>Markets</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <h1 className="text-3xl font-bold mb-8">Our Markets</h1>

      {markets.length === 0 ? (
        <p className="text-muted-foreground">No markets available at the moment.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {markets.map(market => (
            <Link key={market.id} href={`/markets/${market.slug}`}>
              <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-primary" />
                    {market.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground flex items-center gap-4">
                    {market.countryCode && (
                      <span>Country: <span className="uppercase font-medium text-foreground">{market.countryCode}</span></span>
                    )}
                    <span>Currency: <span className="uppercase font-medium text-foreground">{market.defaultCurrency}</span></span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
