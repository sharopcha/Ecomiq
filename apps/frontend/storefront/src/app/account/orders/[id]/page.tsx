import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, MapPin, CreditCard, Truck } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { ReviewForm } from './review-form';
import { getMyOrderAction } from '@/app/actions/orders';
import { getOrderTrackingAction } from '@/app/actions/tracking';

function addressField(address: Record<string, unknown> | null, key: string): string | null {
  const value = address?.[key];
  return typeof value === 'string' ? value : null;
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getMyOrderAction(id);
  if (!order) notFound();

  const tracking = order.shipmentDisplayId
    ? await getOrderTrackingAction(order.storeId, order.shipmentDisplayId)
    : null;
  // Newest first — the API returns events sorted ascending by occurredAt.
  const timelineEvents = tracking ? [...tracking.events].reverse() : [];

  const line1 = addressField(order.shippingAddress, 'line1');
  const city = addressField(order.shippingAddress, 'city');
  const region = addressField(order.shippingAddress, 'region');
  const postalCode = addressField(order.shippingAddress, 'postalCode');
  const countryCode = addressField(order.shippingAddress, 'countryCode');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/account/orders">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Order Details</h2>
          <p className="text-muted-foreground">Order <span className="font-mono">SO-{order.displayNumber}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Items Ordered</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.lines.map((line) => (
                <div key={line.id} className="flex justify-between items-start border-b last:border-0 pb-4 last:pb-0">
                  <div>
                    <p className="font-medium">{line.qty}x {line.name}</p>
                    {line.variantLabel && <p className="text-xs text-muted-foreground">{line.variantLabel}</p>}
                    <p className="text-sm text-muted-foreground">{formatMoney(line.unitPriceMinor * line.qty, order.currency)}</p>
                  </div>
                  {/* "Delivered" (OrderStage.Delivered) is the actual signal a
                      customer received the package — fulfillmentStatus alone
                      only tracks warehouse-side line fulfillment. `productId`
                      is null for lines placed before that column existed. */}
                  {order.stage === 'delivered' && line.productId && (
                    <ReviewForm productId={line.productId} orderId={order.id} />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Truck className="w-5 h-5" />
                Tracking Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!order.shipmentDisplayId ? (
                <p className="text-sm text-muted-foreground">This order hasn't shipped yet.</p>
              ) : !tracking || timelineEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tracking details aren't available right now.</p>
              ) : (
                <div className="relative border-l border-muted-foreground/30 ml-3 space-y-8 py-2">
                  {timelineEvents.map((event, idx) => (
                    <div key={idx} className="relative pl-6">
                      <div className="absolute w-3 h-3 bg-primary rounded-full -left-[6.5px] top-1.5" />
                      <p className="font-medium text-sm capitalize">{event.kind.replace(/_/g, ' ')}</p>
                      {event.description && <p className="text-xs text-muted-foreground">{event.description}</p>}
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.occurredAt).toLocaleString()}
                        {event.location ? ` · ${event.location}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatMoney(order.subtotalMinor, order.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>{formatMoney(order.shippingFeeMinor, order.currency)}</span>
              </div>
              {order.discountMinor > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span>-{formatMoney(order.discountMinor, order.currency)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-3 font-semibold text-base">
                <span>Total</span>
                <span>{formatMoney(order.totalMinor, order.currency)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Shipping Address
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {line1 ? (
                <>
                  <p>{line1}</p>
                  <p>{[city, region, postalCode].filter(Boolean).join(', ')}</p>
                  {countryCode && <p>{countryCode}</p>}
                </>
              ) : (
                <p className="text-muted-foreground">No shipping address on file.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm capitalize">
              <p>{order.paymentStatus.replace(/_/g, ' ')}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
