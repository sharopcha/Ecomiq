import { SetMetadata } from '@nestjs/common';
import { Permission } from '../roles';

export const PERMISSIONS_KEY = 'permissions';

/** `@RequirePermissions('orders:write')` — checked by PermissionsGuard. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
