'use client';

import { useCart, linesForGroup } from './cart-context';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/money';
import { Minus, Plus, Trash2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';

export function CartDrawer() {
  const { isOpen, setIsOpen, validatedCart, updateQty, removeItem, isValidating } = useCart();

  const router = useRouter();

  const handleCheckout = () => {
    setIsOpen(false);
    router.push('/checkout');
  };

  const totalLines = validatedCart?.lines.length || 0;
  const grandTotal = validatedCart?.groups.reduce((acc, g) => acc + g.subtotalMinor, 0) || 0;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Your Cart ({totalLines})</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-hidden mt-6">
          {isValidating && !validatedCart ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Validating cart...
            </div>
          ) : totalLines === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <div className="text-muted-foreground">Your cart is empty.</div>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Continue Shopping</Button>
            </div>
          ) : (
            <ScrollArea className="h-full pr-4">
              <div className="space-y-8 pb-8">
                {validatedCart?.groups.map(group => (
                  <div key={group.storeId} className="space-y-4">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                      Store: {group.storeId}
                    </h4>
                    <div className="space-y-4">
                      {linesForGroup(validatedCart, group).map(line => (
                        <div key={line.variantId} className="flex gap-4 p-3 bg-muted/20 rounded-lg border">
                          <div className="w-20 h-20 bg-muted rounded-md shrink-0 overflow-hidden">
                            {line.imageUrl && (
                              <img src={line.imageUrl} alt={line.name} className="w-full h-full object-cover" />
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0 flex flex-col">
                            <div className="flex justify-between items-start gap-2">
                              <Link 
                                href={`/products/${line.productId}`} 
                                className="font-medium truncate hover:underline"
                                onClick={() => setIsOpen(false)}
                              >
                                {line.name}
                              </Link>
                              <button 
                                onClick={() => removeItem(line.variantId)}
                                className="text-muted-foreground hover:text-destructive shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            
                            <div className="text-xs text-muted-foreground mt-1">
                              {line.optionSummary || 'Default'}
                            </div>
                            
                            {line.problems.length > 0 && (
                              <div className="text-xs text-destructive flex items-center mt-1">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                {line.problems.join(', ')}
                              </div>
                            )}

                            <div className="flex items-center justify-between mt-auto pt-2">
                              <div className="flex items-center border rounded-md h-7">
                                <button 
                                  className="px-2 text-muted-foreground hover:text-foreground"
                                  onClick={() => updateQty(line.variantId, line.qty - 1)}
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="text-sm font-medium w-6 text-center">{line.qty}</span>
                                <button 
                                  className="px-2 text-muted-foreground hover:text-foreground"
                                  onClick={() => updateQty(line.variantId, line.qty + 1)}
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="font-semibold text-sm">
                                {formatMoney(line.unitPriceMinor * line.qty, line.currency)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {totalLines > 0 && (
          <div className="pt-6 border-t mt-auto">
            <div className="flex items-center justify-between font-semibold text-lg mb-6">
              <span>Subtotal</span>
              <span>{formatMoney(grandTotal, 'USD')}</span>
            </div>
            <Button className="w-full" size="lg" onClick={handleCheckout}>
              Proceed to Checkout
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
