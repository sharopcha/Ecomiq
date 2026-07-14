/**
 * CASL-lite role -> permission mapping (ADR-5). Kept intentionally simple
 * (string list membership) for Phase 0; can graduate to full CASL abilities
 * once per-workspace conditions are needed.
 */
export type Role = 'owner' | 'admin' | 'staff';

export const ALL_WORKSPACES = [
  'orders',
  'products',
  'inventory',
  'store',
  'campaign',
  'people',
  'report',
  'support',
  // payment-service's REST endpoints
  // (intents/refunds) need their own permission scope; nothing existing
  // covers it. Additive only: owner/admin get manage, staff get read+write,
  // same as every other workspace via forAll() below.
  'payments',
  // notification-service's REST endpoints (email templates, in-app feed)
  // need their own permission scope; nothing existing covers it. Additive
  // only, same precedent as 'payments' above.
  'notifications',
  // shipping-service's REST endpoints (package presets, labels, shipments,
  // fulfillment, pickups) need their own permission scope; nothing existing
  // covers it. Additive only, same precedent as 'payments'/'notifications'
  // above.
  'shipments',
  // purchasing-service's REST endpoints (suppliers, supplier catalog items,
  // purchase orders) need their own permission scope; nothing existing
  // covers it. Additive only, same precedent as 'shipments' above. Supplier-
  // portal endpoints (Step 12) use `SupplierJwtGuard` instead of workspace
  // permissions, so they don't need an entry here.
  'purchasing',
  // media-service's REST endpoints (File Library: folders, files, upload,
  // transforms, import) need their own permission scope; nothing existing
  // covers it. Additive only, same precedent as 'purchasing' above.
  // `GET /public/files/:id` is `@Public()` by design and doesn't need an
  // entry here.
  'media',
] as const;

export type Workspace = (typeof ALL_WORKSPACES)[number];
export type Action = 'read' | 'write' | 'manage';
export type Permission = `${Workspace}:${Action}`;

function forAll(action: Action): Permission[] {
  return ALL_WORKSPACES.map((w) => `${w}:${action}` as Permission);
}

/** owner: full manage on everything. admin: manage minus billing/membership (handled separately). staff: read + write, no manage. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [...forAll('read'), ...forAll('write'), ...forAll('manage')],
  admin: [...forAll('read'), ...forAll('write'), ...forAll('manage')],
  staff: [...forAll('read'), ...forAll('write')],
};

export function permissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}
