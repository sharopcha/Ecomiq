'use client';

import Link from 'next/link';
import { useCart } from '@/components/cart/cart-context';
import { useWishlist } from '@/lib/hooks/use-wishlist';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { formatMoney } from '@/lib/money';
import { toast } from 'sonner';
import { Trash2, ShoppingCart } from 'lucide-react';
import type { CartLineResponseDto } from '@temp-nx/api-types/catalog';

export function WishlistGrid({ initialItems }: { initialItems: CartLineResponseDto[] }) {
  const { items, removeMutation } = useWishlist(initialItems);
  const { addItem, setIsOpen } = useCart();

  const handleRemove = (variantId: string) => {
    removeMutation.mutate(variantId);
  };

  const handleAddToCart = (item: CartLineResponseDto) => {
    addItem({
      variantId: item.variantId,
      qty: 1, // Add 1
    });
    setIsOpen(true);
    toast.success('Added to cart');
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-16 border rounded-lg bg-card">
        <Heart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Your wishlist is empty</h3>
        <p className="text-muted-foreground mb-6">Find something you love and save it for later.</p>
        <Button asChild>
          <Link href="/products">Browse Products</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map(item => (
        <Card key={item.variantId} className="flex flex-col overflow-hidden">
          <Link href={`/products/${item.productId}`}>
            <div className="aspect-square bg-muted relative">
              <img 
                src={`/api/media/${item.imageUrl}`} 
                alt={item.name} 
                className="object-cover w-full h-full hover:scale-105 transition-transform duration-300"
              />
            </div>
          </Link>
          <CardContent className="pt-4 flex-grow space-y-2">
            <Link href={`/products/${item.productId}`} className="hover:underline">
              <h3 className="font-medium line-clamp-2">{item.name}</h3>
            </Link>
            <p className="text-sm text-muted-foreground">{item.optionsSummary}</p>
            <div className="font-semibold pt-1">
              {formatMoney(item.unitPriceMinor, item.currency)}
            </div>
          </CardContent>
          <CardFooter className="flex gap-2 bg-muted/20 border-t p-4">
            <Button 
              variant="outline" 
              size="icon" 
              className="flex-shrink-0"
              onClick={() => handleRemove(item.variantId)}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
            <Button 
              className="w-full flex items-center gap-2" 
              onClick={() => handleAddToCart(item)}
              disabled={!item.isActive}
            >
              <ShoppingCart className="w-4 h-4" />
              {item.isActive ? 'Add to Cart' : 'Unavailable'}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

function Heart(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}
