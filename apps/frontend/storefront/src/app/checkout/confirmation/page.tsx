import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { OrderStatusChip } from '@/components/checkout/order-status-chip';
import { AlertTriangle } from 'lucide-react';

interface FailedGroup {
  storeId: string;
  reason: string;
}

export default async function CheckoutConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ orders?: string; orderId?: string; failed?: string }>;
}) {
  const params = await searchParams;
  // `orderId` (singular) kept for any stale bookmarked/shared links from
  // before multi-store orders were surfaced here.
  const orderIds = (params.orders ?? params.orderId ?? '').split(',').filter(Boolean);
  let failedGroups: FailedGroup[] = [];
  if (params.failed) {
    try {
      failedGroups = JSON.parse(params.failed);
    } catch {
      failedGroups = [];
    }
  }

  return (
    <div className="container mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
      <h1 className="text-3xl font-bold mb-4">
        {orderIds.length > 0 ? 'Order Placed Successfully!' : 'We hit a problem placing your order'}
      </h1>
      <p className="text-muted-foreground mb-6">
        {orderIds.length > 1
          ? 'Your cart split across multiple stores — each one ships and tracks separately.'
          : 'Thank you for your purchase.'}
      </p>

      {orderIds.length > 0 && (
        <div className="w-full max-w-md mb-8 space-y-4">
          {orderIds.map((orderId) => (
            <div key={orderId} className="bg-card border rounded-lg p-6">
              <div className="flex flex-col space-y-4 items-center">
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Order Status</span>
                <OrderStatusChip orderId={orderId} />
                <span className="text-sm text-muted-foreground mt-4 block">
                  Order ID: <span className="font-mono">{orderId}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {failedGroups.length > 0 && (
        <div className="w-full max-w-md mb-8 bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-left">
          <div className="flex items-center gap-2 mb-3 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium text-sm">
              {orderIds.length > 0 ? 'Some store orders did not go through' : 'No orders were placed'}
            </span>
          </div>
          <ul className="text-sm text-muted-foreground space-y-1">
            {failedGroups.map((f, i) => (
              <li key={i}>Store {f.storeId}: {f.reason}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-3">
            Re-add the affected items to your cart to try again.
          </p>
        </div>
      )}

      <div className="flex gap-4">
        <Button asChild>
          <Link href="/products">Continue Shopping</Link>
        </Button>
      </div>
    </div>
  );
}
