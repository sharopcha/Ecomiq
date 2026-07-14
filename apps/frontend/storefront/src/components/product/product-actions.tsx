'use client';

import { useState, useMemo } from 'react';
import type { ProductDto } from '@temp-nx/api-types/catalog';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/money';
import { Plus, Minus, ShoppingCart, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useWishlist } from '@/lib/hooks/use-wishlist';
import { useCart } from '@/components/cart/cart-context';

interface ProductActionsProps {
  product: ProductDto;
}

export function ProductActions({ product }: ProductActionsProps) {
  const { addItem } = useCart();
  const defaultVariant = product.variants?.find(v => v.isDefault) || product.variants?.[0];
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(defaultVariant?.id || null);
  const [qty, setQty] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const { toggleMutation, isWishlisted } = useWishlist();

  const selectedVariant = product.variants?.find(v => v.id === selectedVariantId);
  const currentPrice = selectedVariant?.priceMinor ?? product.priceMinor;
  const compareAt = product.compareAtMinor; // Optionally variant can have its own compareAt but using product for now

  // We have a matrix of options. We don't have individual option value resolution yet based on optionsSummary.
  // Given that variants just have optionsSummary ("Red / Large"), we'll render variants directly for now as simple radio buttons, 
  // or parse optionsSummary if needed. The simplest reliable way is to list variants.
  
  const handleAddToCart = async () => {
    if (!selectedVariant) return;
    setIsAddingToCart(true);
    try {
      addItem({
        variantId: selectedVariant.id,
        qty,
        expectedPriceMinor: selectedVariant.priceMinor ?? product.priceMinor,
      });
      toast.success('Added to cart', {
        description: `${qty}x ${product.name} (${selectedVariant.optionsSummary || 'Default'})`
      });
    } catch (error) {
      toast.error('Failed to add to cart');
    } finally {
      setIsAddingToCart(false);
    }
  };

  const wishlisted = selectedVariant ? isWishlisted(selectedVariant.id) : false;
  const isWishlisting = toggleMutation.isPending;
  
  const handleWishlist = () => {
    if (!selectedVariant) return;
    toggleMutation.mutate(selectedVariant.id);
  };

  return (
    <div className="space-y-8">
      {/* Price */}
      <div>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold">{formatMoney(currentPrice, 'USD')}</span>
          {compareAt && compareAt > currentPrice && (
            <span className="text-lg text-muted-foreground line-through">
              {formatMoney(compareAt, 'USD')}
            </span>
          )}
        </div>
      </div>

      {/* Variants (Simple list for now based on optionsSummary) */}
      {product.variants && product.variants.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-medium">Options</h3>
          <div className="grid grid-cols-2 gap-2">
            {product.variants.map(variant => (
              <button
                key={variant.id}
                disabled={!variant.isActive}
                onClick={() => setSelectedVariantId(variant.id)}
                className={cn(
                  "p-3 border rounded-lg text-sm transition-all",
                  selectedVariantId === variant.id 
                    ? "border-primary bg-primary/5 font-medium" 
                    : "hover:border-primary/50",
                  !variant.isActive && "opacity-50 cursor-not-allowed bg-muted"
                )}
              >
                {variant.optionsSummary || 'Default'}
                {variant.priceMinor && variant.priceMinor !== product.priceMinor && (
                  <span className="block text-xs text-muted-foreground mt-1">
                    {formatMoney(variant.priceMinor, 'USD')}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Qty & Add to Cart */}
      <div className="flex gap-4">
        <div className="flex items-center border rounded-lg w-32 shrink-0">
          <button 
            className="p-3 text-muted-foreground hover:text-foreground disabled:opacity-50"
            onClick={() => setQty(Math.max(1, qty - 1))}
            disabled={qty <= 1}
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="flex-1 text-center font-medium">{qty}</span>
          <button 
            className="p-3 text-muted-foreground hover:text-foreground"
            onClick={() => setQty(qty + 1)}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        <Button 
          size="lg" 
          className="flex-1" 
          onClick={handleAddToCart}
          disabled={!selectedVariant || !selectedVariant.isActive || isAddingToCart}
        >
          <ShoppingCart className="w-4 h-4 mr-2" />
          Add to Cart
        </Button>
        
        <Button 
          size="lg" 
          variant="outline" 
          onClick={handleWishlist}
          disabled={!selectedVariant || isWishlisting}
          className={cn(wishlisted && "text-red-500 hover:text-red-600")}
        >
          <Heart className={cn("w-4 h-4", wishlisted && "fill-current")} />
        </Button>
      </div>
    </div>
  );
}
