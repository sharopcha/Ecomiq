'use server';

import { gatewayFetch } from '@/lib/gateway';
import type { PublicTrackingResponseDto } from '@temp-nx/api-types/shipping';

/** `GET /api/shipping/track/:storeId/:displayId` — public, no customer JWT (§0/§3: shipping tracking is anonymous by design). */
export async function getOrderTrackingAction(
  storeId: string,
  shipmentDisplayId: string,
): Promise<PublicTrackingResponseDto | null> {
  try {
    return await gatewayFetch<PublicTrackingResponseDto>(
      `/shipping/track/${storeId}/${shipmentDisplayId}`,
      { cache: 'no-store' },
    );
  } catch (error) {
    console.error('Failed to fetch tracking', error);
    return null;
  }
}
