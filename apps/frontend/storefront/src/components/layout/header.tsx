import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { SearchBox } from './search-box';
import { CategoryNav } from './category-nav';
import { CartBadge } from './cart-badge';
import { AccountDropdown } from './account-dropdown';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 md:gap-10">
          <Link href="/" className="flex items-center space-x-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            <span className="font-bold inline-block">Ecomiq</span>
          </Link>
          <CategoryNav />
        </div>
        
        <div className="flex-1 max-w-md hidden sm:block">
          <SearchBox />
        </div>
        
        <div className="flex items-center gap-2">
          <AccountDropdown />
          <CartBadge />
        </div>
      </div>
      {/* Mobile search bar */}
      <div className="container mx-auto px-4 pb-3 sm:hidden">
        <SearchBox />
      </div>
    </header>
  );
}
