'use server';

import { gatewayFetch } from '@/lib/gateway';
import type { ValidatedCartLine } from '@/components/cart/cart-context';
import type { CustomerAddressDto } from '@/types/api';
import type {
  ComposeOrderRequestDto,
  ComposeOrderResponseDto,
  MyOrderDetailDto,
  MyOrderStatusDto,
  MyOrderSummaryDto,
} from '@temp-nx/api-types/order';

/**
 * A two-store cart splits into two orders per §3.3 (one saga each) — the
 * caller must handle all three shapes: every group placed, some placed
 * some failed (honest partial failure, no cross-store rollback), or every
 * group failed (nothing to redirect to).
 */
export async function createOrderAction(
  lines: ValidatedCartLine[],
  shippingAddress: CustomerAddressDto,
  contact: { email?: string; phone?: string } = {},
) {
  try {
    const body: ComposeOrderRequestDto = {
      lines: lines.map((line) => ({
        variantId: line.variantId,
        qty: line.qty,
        expectedPriceMinor: line.unitPriceMinor,
      })),
      // Stored server-side as free-form JSON — see ComposeOrderRequestDto.
      shippingAddress: { ...shippingAddress } as Record<string, unknown>,
      contactEmail: contact.email,
      contactPhone: contact.phone,
    };

    // gatewayFetch resolves with the parsed body (or throws ApiError) —
    // it is not a Response, so there is no `.ok`/`.json()` to unwrap here.
    const data = await gatewayFetch<ComposeOrderResponseDto>('/storefront/orders/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      auth: true,
    });

    if (data.orders.length === 0) {
      const failure = data.failedGroups[0];
      return { success: false as const, error: failure?.reason || 'Failed to create order' };
    }
    return { success: true as const, orders: data.orders, failedGroups: data.failedGroups };
  } catch (error) {
    console.error('Failed to create order', error);
    return { success: false as const, error: 'Failed to create order' };
  }
}

export async function getMyOrderAction(orderId: string): Promise<MyOrderDetailDto | null> {
  try {
    return await gatewayFetch<MyOrderDetailDto>(`/storefront/orders/my-orders/${orderId}`, { auth: true });
  } catch (error) {
    console.error('Failed to fetch order', error);
    return null;
  }
}

export async function getMyOrdersAction(): Promise<MyOrderSummaryDto[]> {
  try {
    const data = await gatewayFetch<{ orders: MyOrderSummaryDto[] }>('/storefront/orders/my-orders', {
      auth: true,
    });
    return data.orders;
  } catch (error) {
    console.error('Failed to fetch orders', error);
    return [];
  }
}

export async function getOrderStatusAction(orderId: string): Promise<MyOrderStatusDto | null> {
  try {
    return await gatewayFetch<MyOrderStatusDto>(`/storefront/orders/my-orders/${orderId}/status`, { auth: true });
  } catch (error) {
    console.error('Failed to poll order status', error);
    return null;
  }
}
