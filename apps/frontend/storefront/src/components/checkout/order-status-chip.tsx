'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getOrderStatusAction } from '@/app/actions/orders';
import type { MyOrderStatusDto } from '@temp-nx/api-types/order';

type OrderStatus = 'processing' | 'confirmed' | 'payment_failed' | 'awaiting_redirect' | 'still_processing';

/** §0/Step 14: `redirectUrl` is the payment forward-compat seam — always
 * `null` with the mock provider, so `awaiting_redirect` never fires today.
 * A future hosted-page provider (Payme/Click/Stripe) fills it in and this
 * branch takes over without any UI restructuring. */
function toDisplayStatus(data: MyOrderStatusDto): OrderStatus | null {
  if (data.redirectUrl) return 'awaiting_redirect';
  if (data.sagaStatus === 'failed' || data.paymentState === 'failed' || data.orderStatus === 'canceled') {
    return 'payment_failed';
  }
  if (data.sagaStatus === 'completed' && data.paymentState === 'paid') return 'confirmed';
  if (data.sagaStatus === 'running' || data.sagaStatus === 'compensating' || data.sagaStatus === null) {
    return 'processing';
  }
  return null;
}

export function OrderStatusChip({ orderId }: { orderId: string }) {
  const [status, setStatus] = useState<OrderStatus>('processing');

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let cancelled = false;
    let pollCount = 0;
    const maxPolls = 15; // e.g. 15 polls of 2s = 30s

    const pollStatus = async () => {
      const data = await getOrderStatusAction(orderId);
      if (cancelled) return;

      if (data) {
        const newStatus = toDisplayStatus(data);
        if (newStatus) {
          setStatus(newStatus);
          if (newStatus === 'confirmed' || newStatus === 'payment_failed') {
            return; // Terminal state
          }
          if (newStatus === 'awaiting_redirect') {
            window.location.href = data.redirectUrl as string;
            return;
          }
        }
      }

      pollCount++;
      if (pollCount >= maxPolls) {
        setStatus('still_processing');
        return;
      }

      timeoutId = setTimeout(pollStatus, 2000); // Polling interval
    };

    pollStatus();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [orderId]);

  if (status === 'processing') {
    return (
      <Badge variant="secondary" className="px-3 py-1 flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin" />
        Processing...
      </Badge>
    );
  }
  
  if (status === 'confirmed') {
    return (
      <Badge variant="default" className="px-3 py-1 bg-green-500 hover:bg-green-600 flex items-center gap-2">
        <CheckCircle className="w-3 h-3" />
        Confirmed
      </Badge>
    );
  }
  
  if (status === 'payment_failed') {
    return (
      <Badge variant="destructive" className="px-3 py-1 flex items-center gap-2">
        <XCircle className="w-3 h-3" />
        Payment Failed (Canceled)
      </Badge>
    );
  }
  
  if (status === 'still_processing') {
    return (
      <Badge variant="outline" className="px-3 py-1 flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        Taking longer than expected...
      </Badge>
    );
  }
  
  return null;
}
