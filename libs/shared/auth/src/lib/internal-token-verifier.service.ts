import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AUTH_MODULE_OPTIONS, AuthSharedModuleOptions } from './jwt-access.strategy';
import { InternalTokenPayload } from './jwt-payload.interface';

/**
 * Verifies a client-credentials (internal) access token against the same
 * JWKS every service already trusts — but deliberately independent of
 * Express/passport, unlike `JwtAccessStrategy`. A gRPC guard needs this
 * same check, reading the token out of gRPC `Metadata` instead of an HTTP
 * `Authorization` header; factoring
 * the verify-and-shape-check logic here means both `InternalAuthGuard`
 * (HTTP) and inventory-service's gRPC auth guard call the same code, they
 * just differ in how they *extract* the bearer string.
 *
 * Uses jose's `createRemoteJWKSet` directly (fetch + cache, no passport)
 * rather than `jwks-rsa` — this class isn't a passport strategy, so there's
 * no reason to carry that dependency here too.
 */
@Injectable()
export class InternalTokenVerifierService {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;

  constructor(@Inject(AUTH_MODULE_OPTIONS) options: AuthSharedModuleOptions) {
    this.jwks = createRemoteJWKSet(new URL(options.jwksUri));
    this.issuer = options.issuer ?? 'ecomiq-identity';
  }

  /**
   * Verifies signature/issuer/expiry, then asserts this is actually an
   * internal (client-credentials) token — an ordinary user access token
   * verifies fine against the same key but must not be usable here. Throws
   * `UnauthorizedException` for any failure (bad signature, expired,
   * wrong token kind) rather than distinguishing reasons, same as
   * JwtAuthGuard's failure mode.
   */
  async verify(token: string): Promise<InternalTokenPayload> {
    let payload: InternalTokenPayload;
    try {
      const result = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        algorithms: ['RS256'],
      });
      payload = result.payload as unknown as InternalTokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired internal token');
    }

    if (payload.type !== 'internal' || payload.aud !== 'internal') {
      throw new UnauthorizedException(
        'Not an internal service-credential token',
      );
    }

    return payload;
  }
}
