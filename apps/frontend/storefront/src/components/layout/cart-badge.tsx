'use client';

import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/components/cart/cart-context';

export function CartBadge() {
  const { items, setIsOpen } = useCart();
  const itemCount = items.reduce((acc, item) => acc + item.qty, 0);

  return (
    <Button variant="ghost" size="icon" className="relative" onClick={() => setIsOpen(true)}>
      <ShoppingCart className="h-5 w-5" />
      {itemCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          {itemCount}
        </span>
      )}
      <span className="sr-only">Cart</span>
    </Button>
  );
}
