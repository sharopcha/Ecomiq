import type { JWTPayload as JoseJWTPayload } from 'jose';

/**
 * Claims carried by an RS256 access token issued by purchasing-service for
 * the *supplier* (portal) principal — a third principal alongside staff
 * (`JwtAccessPayload`) and customer (`CustomerJwtPayload`), signed with
 * purchasing's own keypair against purchasing's own JWKS, never identity's
 * or crm's. `aud: 'supplier'` (fixed, not just a `type` discriminator) is
 * what keeps a supplier token from ever being accepted where a staff or
 * customer token is expected, or vice versa — even if a verifier only
 * checks `aud` and forgets to check `type`, it still fails closed.
 */
export interface SupplierJwtPayload extends JoseJWTPayload {
  /** supplier.id (ULID) */
  sub: string;
  /** store.id (ULID) the token is scoped to */
  store_id: string;
  aud: 'supplier';
  type: 'supplier_access';
  iss: string;
  iat: number;
  exp: number;
  jti: string;
}

/** Shape attached to `Request.user` by `SupplierJwtAccessStrategy`. */
export interface AuthenticatedSupplier {
  id: string;
  storeId: string;
}
