import type { JWTPayload as JoseJWTPayload } from 'jose';

/**
 * Claims carried by an RS256 access token issued by crm-service for the
 * *customer* (storefront) principal — a separate, lighter principal than
 * `JwtAccessPayload`'s staff tokens, signed with crm's own keypair against
 * crm's own JWKS, never identity's. `aud: 'customer'` (fixed, not just a
 * `type` discriminator) is what keeps a customer token from ever being
 * accepted where a staff token is expected, or vice versa — even if a
 * verifier only checks `aud` and forgets to check `type`, it still fails
 * closed.
 */
export interface CustomerJwtPayload extends JoseJWTPayload {
  /** customer.id (ULID) */
  sub: string;
  /** store.id (ULID) the token is scoped to */
  store_id: string;
  aud: 'customer';
  type: 'customer_access';
  iss: string;
  iat: number;
  exp: number;
  jti: string;
}

/** Shape attached to `Request.user` by `CustomerJwtAccessStrategy`. */
export interface AuthenticatedCustomer {
  id: string;
  storeId: string;
}
