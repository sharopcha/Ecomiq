import type { CursorPaginatedResponse } from '../common';

export interface LoyaltyTxnDto {
  id: string;
  accountId: string;
  pointsDelta: number;
  reason: 'order' | 'manual' | 'referral';
  refId?: string | null;
  note?: string | null;
  createdAt: string;
}

/** `GET /crm/storefront/loyalty` */
export interface LoyaltyStatusDto {
  points: number;
  tier: string | null;
  history: CursorPaginatedResponse<LoyaltyTxnDto>;
}

/** `GET /crm/storefront/referral-code` */
export interface ReferralCodeResponse {
  code: string;
}

export interface ReferralDto {
  id: string;
  referrerId?: string | null;
  refereeId: string;
  code: string;
  status: 'pending' | 'completed';
  createdAt: string;
}

/** `GET /crm/storefront/referrals` — cursor-paginated, no `total` field. */
export type ReferralsResponse = CursorPaginatedResponse<ReferralDto>;
