/**
 * `GET /crm/storefront/me` — matches `StorefrontProfileWithLoyalty` in
 * crm-service exactly (`apps/services/crm/src/app/storefront/storefront.service.ts`,
 * itself `Pick<Customer, ...>` off the `Customer` entity). Note there is no
 * `firstName`/`lastName` split — customers have a single `fullName` field,
 * and `PATCH /crm/storefront/me` only accepts `fullName`/`phone`/
 * `avatarFileId` (see `UpdateStorefrontProfileDto`). `loyalty` is only
 * present on the GET response — PATCH returns the profile without it.
 */
export interface CustomerProfileDto {
  id: string;
  storeId: string;
  displayId: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  avatarFileId?: string | null;
  source: 'online_store' | 'pos' | 'manual' | 'marketplace' | 'mobile_app';
  status: 'active' | 'archived';
  totalOrders: number;
  totalSpentMinor: number;
  lastOnlineAt?: string | null;
  registeredAt?: string | null;
  referralCode?: string | null;
  createdAt: string;
  updatedAt: string;
  loyalty?: { points: number; tier: string } | null;
}

export interface UpdateCustomerProfileRequestDto {
  fullName?: string;
  phone?: string;
  avatarFileId?: string;
}
