'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart, linesForGroup } from '@/components/cart/cart-context';
import { CustomerAddressDto, CustomerProfileDto } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { formatMoney } from '@/lib/money';
import { createOrderAction } from '@/app/actions/orders';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { createAddressAction } from '@/app/actions/addresses';

export function CheckoutFlow({ 
  initialAddresses, 
  initialProfile 
}: { 
  initialAddresses: CustomerAddressDto[]; 
  initialProfile: CustomerProfileDto | null;
}) {
  const { validatedCart, clearCart } = useCart();
  const router = useRouter();
  
  const [step, setStep] = useState<'contact' | 'review'>('contact');
  const [addresses, setAddresses] = useState(initialAddresses);
  
  const defaultAddress = addresses.find(a => a.isDefaultShipping) || addresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState<string>(defaultAddress?.id || '');
  
  const [email, setEmail] = useState(initialProfile?.email || '');
  const [phone, setPhone] = useState(initialProfile?.phone || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingAddress, setIsAddingAddress] = useState(false);

  const totalLines = validatedCart?.lines.length || 0;
  const grandTotal = validatedCart?.groups.reduce((acc, g) => acc + g.subtotalMinor, 0) || 0;

  if (totalLines === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-8">Your cart is empty. Add some items to proceed.</p>
        <Button onClick={() => router.push('/products')}>Continue Shopping</Button>
      </div>
    );
  }

  const handleContinueToReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAddressId && !isAddingAddress) {
      toast.error('Please select or add a shipping address');
      return;
    }
    if (!email) {
      toast.error('Email is required');
      return;
    }
    setStep('review');
  };

  const handlePlaceOrder = async () => {
    if (!validatedCart || totalLines === 0) return;
    
    const address = addresses.find(a => a.id === selectedAddressId);
    if (!address) {
      toast.error('Selected address not found');
      return;
    }

    setIsSubmitting(true);
    try {
      const allLines = validatedCart.lines;
      const res = await createOrderAction(allLines, address, { email, phone });

      if (res.success) {
        // §3.3: no cross-store rollback — orders that placed stay placed
        // even if a sibling group failed, so the cart always clears once
        // at least one order exists (the confirmation page surfaces any
        // failedGroups so the customer knows what to retry).
        clearCart();
        if (res.failedGroups.length > 0) {
          toast.warning(`${res.orders.length} of ${res.orders.length + res.failedGroups.length} store orders placed`);
        } else {
          toast.success('Order placed successfully!');
        }
        const orderIds = res.orders.map((o) => o.id).join(',');
        const params = new URLSearchParams({ orders: orderIds });
        if (res.failedGroups.length > 0) {
          params.set('failed', JSON.stringify(res.failedGroups.map((f) => ({ storeId: f.storeId, reason: f.reason }))));
        }
        router.push(`/checkout/confirmation?${params.toString()}`);
      } else {
        toast.error(res.error || 'Failed to place order');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddAddress = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newAddress = {
      line1: formData.get('line1') as string,
      line2: formData.get('line2') as string,
      city: formData.get('city') as string,
      region: formData.get('region') as string,
      postalCode: formData.get('postalCode') as string,
      countryCode: formData.get('countryCode') as string,
    };

    setIsSubmitting(true);
    try {
      const res = await createAddressAction(newAddress);
      if (res.success && res.address) {
        setAddresses([...addresses, res.address]);
        setSelectedAddressId(res.address.id);
        setIsAddingAddress(false);
        toast.success('Address added');
      } else {
        toast.error(res.error || 'Failed to add address');
      }
    } catch (e) {
      toast.error('Failed to add address');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div className="md:col-span-2 space-y-8">
        {step === 'contact' ? (
          <div className="bg-card border rounded-lg p-6 space-y-8">
            <div>
              <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4 flex justify-between items-center">
                Shipping Address
                {!isAddingAddress && (
                  <Button variant="outline" size="sm" onClick={() => setIsAddingAddress(true)}>
                    Add New
                  </Button>
                )}
              </h2>

              {isAddingAddress ? (
                <form onSubmit={handleAddAddress} className="space-y-4 border p-4 rounded-md">
                  <div className="space-y-2">
                    <Label>Address Line 1</Label>
                    <Input name="line1" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Address Line 2 (Optional)</Label>
                    <Input name="line2" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input name="city" required />
                    </div>
                    <div className="space-y-2">
                      <Label>State/Region</Label>
                      <Input name="region" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Postal Code</Label>
                      <Input name="postalCode" required />
                    </div>
                    <div className="space-y-2">
                      <Label>Country Code (2 letters)</Label>
                      <Input name="countryCode" required maxLength={2} />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <Button type="button" variant="ghost" onClick={() => setIsAddingAddress(false)}>Cancel</Button>
                    <Button type="submit" disabled={isSubmitting}>Save Address</Button>
                  </div>
                </form>
              ) : (
                <RadioGroup value={selectedAddressId} onValueChange={setSelectedAddressId} className="space-y-3">
                  {addresses.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No saved addresses.</p>
                  ) : (
                    addresses.map(addr => (
                      <div key={addr.id} className="flex items-start space-x-3 border p-4 rounded-md">
                        <RadioGroupItem value={addr.id} id={addr.id} className="mt-1" />
                        <Label htmlFor={addr.id} className="cursor-pointer flex flex-col font-normal">
                          <span className="font-medium">{addr.line1}</span>
                          {addr.line2 && <span>{addr.line2}</span>}
                          <span className="text-muted-foreground">
                            {addr.city}, {addr.region} {addr.postalCode}
                          </span>
                          <span className="text-muted-foreground uppercase">{addr.countryCode}</span>
                        </Label>
                      </div>
                    ))
                  )}
                </RadioGroup>
              )}
            </div>

            <Button 
              className="w-full" 
              size="lg" 
              onClick={handleContinueToReview}
              disabled={!selectedAddressId && !isAddingAddress}
            >
              Continue to Review
            </Button>
          </div>
        ) : (
          <div className="bg-card border rounded-lg p-6 space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
              <h2 className="text-xl font-semibold">Review & Place Order</h2>
              <Button variant="ghost" size="sm" onClick={() => setStep('contact')}>Edit Details</Button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <h3 className="font-semibold mb-2">Contact</h3>
                <p>{email}</p>
                <p>{phone}</p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Shipping to</h3>
                {addresses.find(a => a.id === selectedAddressId) && (
                  <div className="text-muted-foreground">
                    <p>{addresses.find(a => a.id === selectedAddressId)?.line1}</p>
                    <p>{addresses.find(a => a.id === selectedAddressId)?.city}, {addresses.find(a => a.id === selectedAddressId)?.postalCode}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="font-semibold mb-4">Order Items</h3>
              <div className="space-y-6">
                {validatedCart?.groups.map(group => (
                  <div key={group.storeId} className="space-y-3 bg-muted/50 p-4 rounded-md">
                    <h4 className="font-medium flex items-center justify-between">
                      Store: {group.storeId}
                      <span className="text-sm font-normal text-muted-foreground">
                        Subtotal: {formatMoney(group.subtotalMinor, 'USD')}
                      </span>
                    </h4>
                    {linesForGroup(validatedCart ?? null, group).map(line => (
                      <div key={line.variantId} className="flex justify-between text-sm items-center">
                        <div className="flex items-center gap-3">
                          <img src={`/api/media/${line.imageUrl}`} className="w-10 h-10 object-cover rounded bg-muted" alt={line.name} />
                          <span>{line.qty}x {line.name}</span>
                        </div>
                        <span>{formatMoney(line.unitPriceMinor * line.qty, line.currency)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm text-muted-foreground pt-2 border-t">
                      <span>Shipping (Flat Rate)</span>
                      <span>$0.00</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div>
        <div className="bg-card border rounded-lg p-6 sticky top-24">
          <h2 className="text-xl font-semibold mb-6">Order Summary</h2>
          
          <div className="space-y-3 border-b pb-4 mb-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Items ({totalLines})</span>
              <span>{formatMoney(grandTotal, 'USD')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span>Free</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxes</span>
              <span>Calculated at checkout</span>
            </div>
          </div>
          
          <div className="flex justify-between font-bold text-lg mb-6">
            <span>Total</span>
            <span>{formatMoney(grandTotal, 'USD')}</span>
          </div>
          
          <Button 
            className="w-full" 
            size="lg"
            onClick={handlePlaceOrder}
            disabled={step === 'contact' || isSubmitting}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {step === 'contact' ? 'Continue to Review' : 'Place Order'}
          </Button>
          {step === 'review' && (
            <p className="text-xs text-muted-foreground text-center mt-4">
              Coming in next step: Real payment processing. Currently using stubbed placement.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
