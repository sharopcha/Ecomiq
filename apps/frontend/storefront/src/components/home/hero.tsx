import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function Hero() {
  return (
    <div className="relative bg-muted overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=2070"
          alt="Ecomiq Hero"
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background to-transparent" />
      </div>
      
      <div className="container relative z-10 mx-auto px-4 py-24 md:py-32 lg:py-40">
        <div className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6">
            Discover independent markets all in one place.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-8">
            Shop directly from curated creators and local vendors. Support independent businesses while finding unique products you won't see anywhere else.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button size="lg" asChild>
              <Link href="/products">Shop All Products</Link>
            </Button>
            <Button size="lg" variant="outline" className="bg-background/50 backdrop-blur-sm" asChild>
              <Link href="/markets">Explore Markets</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
