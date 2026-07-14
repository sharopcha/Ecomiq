import { SetMetadata } from '@nestjs/common';

export const INTERNAL_SCOPE_KEY = 'internalScope';

/**
 * `@RequireInternalScope('inventory:reserve')` — checked by
 * `InternalAuthGuard` against the `scope` claim of a client-credentials
 * token. Separate metadata key/type from `@RequirePermissions` (roles.ts'
 * `Permission`): internal scopes are a service-to-service capability
 * namespace, not the end-user CASL-lite workspace permissions.
 */
export const RequireInternalScope = (...scopes: string[]) =>
  SetMetadata(INTERNAL_SCOPE_KEY, scopes);
