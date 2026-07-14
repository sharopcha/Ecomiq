import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/money';
import { PackageSearch } from 'lucide-react';
import { getMyOrdersAction } from '@/app/actions/orders';

export default async function OrdersPage() {
  const orders = await getMyOrdersAction();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Order History</h2>
        <p className="text-muted-foreground">View and track your recent orders.</p>
      </div>

      <div className="space-y-4">
        {orders.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-card">
            <PackageSearch className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">You haven't placed any orders yet.</p>
          </div>
        ) : (
          orders.map((order) => (
            <Card key={order.id} className="overflow-hidden">
              <div className="bg-muted/30 px-6 py-4 flex flex-wrap justify-between items-center gap-4">
                <div className="flex gap-8 text-sm">
                  <div>
                    <p className="text-muted-foreground font-medium uppercase text-xs mb-1">Order Placed</p>
                    <p>{new Date(order.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium uppercase text-xs mb-1">Total</p>
                    <p>{formatMoney(order.totalMinor, order.currency)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium uppercase text-xs mb-1">Order #</p>
                    <p className="font-mono">SO-{order.displayNumber}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={order.fulfillmentStatus === 'fulfilled' ? 'default' : 'secondary'} className="capitalize">
                    {order.fulfillmentStatus.replace(/_/g, ' ')}
                  </Badge>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/account/orders/${order.id}`}>View Details</Link>
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
