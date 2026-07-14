import { gatewayFetch } from '@/lib/gateway';
import { CustomerProfileDto } from '@/types/api';
import { ProfileForm } from './profile-form';
import { redirect } from 'next/navigation';

async function getProfile(): Promise<CustomerProfileDto | null> {
  try {
    // gatewayFetch resolves with the parsed body (or throws — including on
    // 401) — not a Response, so there is no `.ok`/`.status`/`.json()` to
    // inspect; the catch below already covers the "not logged in" case.
    return await gatewayFetch<CustomerProfileDto>('/crm/storefront/me', { cache: 'no-store' });
  } catch (error) {
    console.error('Failed to fetch profile', error);
  }
  return null;
}

export default async function ProfilePage() {
  const profile = await getProfile();
  
  if (!profile) {
    redirect('/login?next=/account/profile');
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Profile</h2>
        <p className="text-muted-foreground">Manage your personal information.</p>
      </div>
      
      <div className="border rounded-lg p-6 max-w-2xl">
        <ProfileForm initialProfile={profile} />
      </div>
    </div>
  );
}
