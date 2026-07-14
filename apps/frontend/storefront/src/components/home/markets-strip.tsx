import Link from 'next/link';
import { gatewayFetch } from '@/lib/gateway';
import type { PublicMarketDto, MarketsListResponse } from '@temp-nx/api-types/identity';
import { Skeleton } from '@/components/ui/skeleton';

export async function MarketsStrip() {
  let markets: PublicMarketDto[] = [];

  try {
    // gatewayFetch resolves with the parsed body (or throws) — not a
    // Response, so there is no `.ok`/`.json()` to unwrap.
    const data = await gatewayFetch<MarketsListResponse>('/markets');
    markets = data.markets;
  } catch (error) {
    console.error('Failed to fetch markets strip', error);
  }

  if (markets.length === 0) {
    return null;
  }

  return (
    <section className="py-16 bg-muted/50 border-y">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Meet our Creators</h2>
          <p className="text-muted-foreground text-lg">
            Every product on Ecomiq comes from an independent market. 
            Discover the stories and people behind what you buy.
          </p>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {markets.slice(0, 6).map((market) => (
            <Link 
              key={market.id} 
              href={`/markets/${market.slug}`}
              className="flex flex-col items-center group"
            >
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden bg-background border-4 border-background shadow-sm mb-4 transition-transform duration-300 group-hover:scale-105 group-hover:shadow-md">
                {market.logoFileId ? (
                  <img 
                    src={`/api/files/${market.logoFileId}`} 
                    alt={market.name} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground bg-muted">
                    {market.name.charAt(0)}
                  </div>
                )}
              </div>
              <h3 className="font-semibold text-center group-hover:text-primary transition-colors">{market.name}</h3>
            </Link>
          ))}
        </div>
        
        <div className="mt-12 text-center">
          <Link href="/markets" className="text-primary font-medium hover:underline inline-flex items-center">
            View all markets &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}

export function MarketsStripSkeleton() {
  return (
    <section className="py-16 bg-muted/50 border-y">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10 flex flex-col items-center">
          <Skeleton className="h-9 w-[250px] mb-4" />
          <Skeleton className="h-6 w-[80%]" />
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center">
              <Skeleton className="w-24 h-24 md:w-32 md:h-32 rounded-full mb-4" />
              <Skeleton className="h-5 w-[100px]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
