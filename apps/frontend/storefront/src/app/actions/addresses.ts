'use server';

import { gatewayFetch } from '@/lib/gateway';
import { revalidatePath } from 'next/cache';
import type { CreateAddressRequestDto, UpdateAddressRequestDto, CustomerAddressDto } from '@temp-nx/api-types/crm';

// gatewayFetch resolves with the parsed body (or throws ApiError) — it is
// not a Response, so there is no `.ok`/`.json()` to unwrap.

export async function createAddressAction(address: CreateAddressRequestDto) {
  try {
    const data = await gatewayFetch<CustomerAddressDto>('/crm/storefront/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(address),
    });
    revalidatePath('/checkout');
    revalidatePath('/account/addresses');
    return { success: true, address: data };
  } catch (error) {
    console.error('Failed to create address', error);
    return { success: false, error: 'Failed to create address' };
  }
}

export async function updateAddressAction(addressId: string, address: UpdateAddressRequestDto) {
  try {
    const data = await gatewayFetch<CustomerAddressDto>(`/crm/storefront/addresses/${addressId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(address),
    });
    revalidatePath('/checkout');
    revalidatePath('/account/addresses');
    return { success: true, address: data };
  } catch (error) {
    console.error('Failed to update address', error);
    return { success: false, error: 'Failed to update address' };
  }
}

export async function deleteAddressAction(addressId: string) {
  try {
    await gatewayFetch(`/crm/storefront/addresses/${addressId}`, {
      method: 'DELETE',
    });
    revalidatePath('/checkout');
    revalidatePath('/account/addresses');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete address', error);
    return { success: false, error: 'Failed to delete address' };
  }
}
