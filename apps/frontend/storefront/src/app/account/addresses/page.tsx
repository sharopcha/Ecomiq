import { gatewayFetch } from '@/lib/gateway';
import { CustomerAddressDto } from '@/types/api';
import { AddressManager } from './address-manager';
import { redirect } from 'next/navigation';

async function getAddresses(): Promise<CustomerAddressDto[]> {
  try {
    // gatewayFetch resolves with the parsed body (or throws — including on
    // 401) — not a Response, so there is no `.ok`/`.status`/`.json()` to
    // inspect; the catch below already covers the "not logged in" case.
    return await gatewayFetch<CustomerAddressDto[]>('/crm/storefront/addresses', { cache: 'no-store' });
  } catch (error) {
    console.error('Failed to fetch addresses', error);
  }
  return [];
}

export default async function AddressesPage() {
  const addresses = await getAddresses();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Addresses</h2>
        <p className="text-muted-foreground">Manage your shipping and billing addresses.</p>
      </div>
      
      <div className="max-w-3xl">
        <AddressManager initialAddresses={addresses} />
      </div>
    </div>
  );
}
