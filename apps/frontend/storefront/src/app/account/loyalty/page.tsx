import { gatewayFetch } from '@/lib/gateway';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award, Share2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LoyaltyStatusDto, ReferralCodeResponse, ReferralsResponse } from '@temp-nx/api-types/crm';

async function getLoyalty(): Promise<LoyaltyStatusDto> {
  try {
    // gatewayFetch resolves with the parsed body (or throws) — not a
    // Response, so there is no `.ok`/`.json()` to unwrap.
    return await gatewayFetch<LoyaltyStatusDto>('/crm/storefront/loyalty', { cache: 'no-store' });
  } catch (error) {
    console.error('Failed to fetch loyalty', error);
  }
  return { points: 0, tier: 'Bronze', history: { items: [], nextCursor: null } }; // Fallback
}

async function getReferralCode(): Promise<string | null> {
  try {
    const data = await gatewayFetch<ReferralCodeResponse>('/crm/storefront/referral-code', { cache: 'no-store' });
    return data.code;
  } catch (error) {
    console.error('Failed to fetch referral code', error);
  }
  return null;
}

async function getReferrals(): Promise<ReferralsResponse> {
  try {
    return await gatewayFetch<ReferralsResponse>('/crm/storefront/referrals', { cache: 'no-store' });
  } catch (error) {
    console.error('Failed to fetch referrals', error);
  }
  return { items: [], nextCursor: null };
}

export default async function LoyaltyPage() {
  const [loyalty, referralCode, referrals] = await Promise.all([
    getLoyalty(),
    getReferralCode(),
    getReferrals(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Loyalty & Referrals</h2>
        <p className="text-muted-foreground">Manage your rewards and invite friends.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              Your Loyalty Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider mb-1">Current Tier</p>
                <Badge variant="default" className="text-lg px-3 py-1">
                  {loyalty.tier}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider mb-1">Points Balance</p>
                <p className="text-3xl font-bold text-primary">{loyalty.points}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground pt-4 border-t">
              Earn points with every purchase and redeem them for discounts at checkout.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5" />
              Refer a Friend
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share your unique referral code with friends. They get a discount, and you earn bonus points!
            </p>
            {referralCode ? (
              <div className="flex gap-2">
                <div className="bg-muted px-4 py-2 rounded-md font-mono font-medium flex-1 text-center select-all">
                  {referralCode}
                </div>
                <Button variant="outline">Copy</Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Referral program is currently unavailable.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Your Referrals ({referrals.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {referrals.items.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">You haven't referred anyone yet.</p>
              <p className="text-sm text-muted-foreground mt-1">Share your code above to get started!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {referrals.items.map((ref) => (
                <div key={ref.id} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">Referred User</p>
                    <p className="text-sm text-muted-foreground">{new Date(ref.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Badge variant="secondary" className="capitalize">{ref.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
