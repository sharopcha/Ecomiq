import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { User, MapPin, Heart, Award, Package } from 'lucide-react';

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">My Account</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <aside className="md:col-span-1 space-y-2">
          <Button variant="ghost" className="w-full justify-start" asChild>
            <Link href="/account/profile">
              <User className="mr-2 h-4 w-4" />
              Profile
            </Link>
          </Button>
          <Button variant="ghost" className="w-full justify-start" asChild>
            <Link href="/account/addresses">
              <MapPin className="mr-2 h-4 w-4" />
              Addresses
            </Link>
          </Button>
          <Button variant="ghost" className="w-full justify-start" asChild>
            <Link href="/account/wishlist">
              <Heart className="mr-2 h-4 w-4" />
              Wishlist
            </Link>
          </Button>
          <Button variant="ghost" className="w-full justify-start" asChild>
            <Link href="/account/loyalty">
              <Award className="mr-2 h-4 w-4" />
              Loyalty & Referrals
            </Link>
          </Button>
          <Button variant="ghost" className="w-full justify-start" asChild>
            <Link href="/account/orders">
              <Package className="mr-2 h-4 w-4" />
              Orders
            </Link>
          </Button>
        </aside>
        
        <main className="md:col-span-3">
          {children}
        </main>
      </div>
    </div>
  );
}
