'use server';

import { gatewayFetch } from '@/lib/gateway';
import { revalidatePath } from 'next/cache';
import type { UpdateCustomerProfileRequestDto } from '@temp-nx/api-types/crm';

export async function updateProfileAction(data: UpdateCustomerProfileRequestDto) {
  try {
    // gatewayFetch resolves with the parsed body (or throws) — not a
    // Response, so there is no `.ok`/`.json()` to unwrap.
    const updated = await gatewayFetch('/crm/storefront/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    revalidatePath('/account');
    revalidatePath('/checkout');
    return { success: true, profile: updated };
  } catch (error) {
    console.error('Failed to update profile', error);
    return { success: false, error: 'Failed to update profile' };
  }
}
