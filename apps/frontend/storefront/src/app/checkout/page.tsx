import { Metadata } from 'next';
import { gatewayFetch } from '@/lib/gateway';
import { CustomerAddressDto, CustomerProfileDto } from '@/types/api';
import { CheckoutFlow } from '@/components/checkout/checkout-flow';

export const metadata: Metadata = {
  title: 'Checkout | Ecomiq',
};

async function getAddresses(): Promise<CustomerAddressDto[]> {
  try {
    // Note: requires customer JWT, so gatewayFetch forwards the sf_access
    // cookie. gatewayFetch resolves with the parsed body (or throws) — not
    // a Response, so there is no `.ok`/`.json()` to unwrap.
    return await gatewayFetch<CustomerAddressDto[]>('/crm/storefront/addresses', { cache: 'no-store' });
  } catch (error) {
    console.error('Failed to fetch addresses', error);
  }
  return [];
}

async function getProfile(): Promise<CustomerProfileDto | null> {
  try {
    return await gatewayFetch<CustomerProfileDto>('/crm/storefront/me', { cache: 'no-store' });
  } catch (error) {
    console.error('Failed to fetch profile', error);
  }
  return null;
}

export default async function CheckoutPage() {
  const [addresses, profile] = await Promise.all([getAddresses(), getProfile()]);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Checkout</h1>
      <CheckoutFlow initialAddresses={addresses} initialProfile={profile} />
    </div>
  );
}
