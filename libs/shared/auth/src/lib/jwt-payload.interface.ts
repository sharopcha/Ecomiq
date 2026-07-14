import type { JWTPayload as JoseJWTPayload } from 'jose';

/**
 * Claims carried by an RS256 access token issued by identity-service.
 * Verified by every service (and the gateway) via JWKS — see ADR-5.
 *
 * Extends jose's `JWTPayload` (which carries the index signature `jose`'s
 * `SignJWT`/`jwtVerify` generics require) rather than declaring iss/iat/exp/jti
 * separately.
 */
export interface JwtAccessPayload extends JoseJWTPayload {
  /** app_user.id (ULID) */
  sub: string;
  /** store.id (ULID) the token is scoped to — drives RLS / tenant scoping */
  store_id: string;
  /** membership role for (sub, store_id) */
  role: 'owner' | 'admin' | 'staff';
  /** flattened CASL-lite permission strings, e.g. "orders:read" */
  perms: string[];
  /** token kind discriminator */
  type: 'access';
  iss: string;
  iat: number;
  exp: number;
  jti: string;
}

/**
 * Short-lived token returned after a successful local/google login when the
 * account has TOTP 2FA enabled. Only redeemable at POST /auth/2fa/verify —
 * carries no store/role/perms so it cannot be used against any protected route.
 */
export interface MfaChallengePayload extends JoseJWTPayload {
  sub: string;
  type: 'mfa_challenge';
  iss: string;
  iat: number;
  exp: number;
  jti: string;
}

/**
 * Short-lived token returned instead of tokens when a user has memberships
 * in more than one store and didn't specify which. Redeemable at
 * POST /auth/select-store — avoids making the user re-enter their password
 * (or 2FA code) a second time just to pick a store.
 */
export interface StoreSelectionPayload extends JoseJWTPayload {
  sub: string;
  type: 'store_selection';
  iss: string;
  iat: number;
  exp: number;
  jti: string;
}

/**
 * Short-lived token returned after signup/login when the user has not yet
 * configured a store. Only redeemable at POST /auth/setup-store —
 * carries no store/role/perms so it cannot be used against any protected route.
 */
export interface SetupChallengePayload extends JoseJWTPayload {
  sub: string;
  type: 'setup_challenge';
  iss: string;
  iat: number;
  exp: number;
  jti: string;
}

/**
 * Service-to-service (client-credentials) token — aud is always 'internal'.
 * Issued by `POST /auth/token` (ADR-5)
 * for a `service_account` row, not a human `app_user` — deliberately has no
 * `store_id`: internal principals authenticate as the platform, not as a
 * user acting within a tenant.
 */
export interface InternalTokenPayload extends JoseJWTPayload {
  /** service_account.clientId — the calling principal's public identifier (not the human-facing name). */
  sub: string;
  /** service_account.serviceName, e.g. 'order-service' — human-readable, for logging/debugging. */
  svc: string;
  /** Granted internal scopes for this token, e.g. ['inventory:reserve'] — checked by InternalAuthGuard. */
  scope: string[];
  aud: 'internal';
  type: 'internal';
  iss: string;
  iat: number;
  exp: number;
  jti: string;
}

/** Shape attached to `Request.internalPrincipal` by `InternalAuthGuard`. */
export interface AuthenticatedInternalPrincipal {
  clientId: string;
  service: string;
  scope: string[];
}

export type AnyEcomiqJwtPayload =
  | JwtAccessPayload
  | MfaChallengePayload
  | StoreSelectionPayload
  | SetupChallengePayload
  | InternalTokenPayload;

/** Shape attached to `Request.user` by JwtAccessStrategy. */
export interface AuthenticatedUser {
  id: string;
  storeId: string;
  role: JwtAccessPayload['role'];
  perms: string[];
}
