'use server';

import { gatewayFetch } from '@/lib/gateway';

export async function createReviewAction(
  productId: string,
  orderId: string,
  data: { rating: number; title: string; body: string },
) {
  try {
    // gatewayFetch resolves with the parsed body (or throws ApiError) — see
    // the same fix in app/actions/orders.ts's createOrderAction.
    await gatewayFetch('/crm/storefront/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, orderId, ...data }),
      auth: true,
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to submit review', error);
    return { success: false, error: 'Failed to submit review' };
  }
}
