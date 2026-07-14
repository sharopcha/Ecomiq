import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';
import {
  AnyEcomiqJwtPayload,
  AuthenticatedUser,
} from './jwt-payload.interface';

export const AUTH_MODULE_OPTIONS = 'AUTH_MODULE_OPTIONS';

export interface AuthSharedModuleOptions {
  /** identity-service JWKS endpoint, e.g. http://localhost:3001/api/.well-known/jwks.json */
  jwksUri: string;
  /** must match JWT_ISSUER used by identity-service when signing (default 'ecomiq-identity') */
  issuer?: string;
  /** ms to cache a given JWKS key before refetching (default 10 min) */
  jwksCacheMaxAge?: number;
}

/**
 * Validates RS256 access tokens against identity-service's published JWKS.
 * Registered under the strategy name 'jwt-access' so it never collides with
 * a service's own local passport-jwt usage (e.g. identity-service's own
 * internal refresh-token guard).
 */
@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  'jwt-access',
) {
  constructor(@Inject(AUTH_MODULE_OPTIONS) options: AuthSharedModuleOptions) {
    super({
      jwtFromRequest: (req) => {
        const header = req?.headers?.authorization;
        if (header?.startsWith('Bearer ')) return header.slice(7);
        return null;
      },
      ignoreExpiration: false,
      issuer: options.issuer ?? 'ecomiq-identity',
      algorithms: ['RS256'],
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        cacheMaxAge: options.jwksCacheMaxAge ?? 10 * 60 * 1000,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: options.jwksUri,
      }),
    });
  }

  validate(payload: AnyEcomiqJwtPayload): AuthenticatedUser {
    // This strategy backs the *global*
    // JwtAuthGuard, so any RS256 token signed by identity's key reaches
    // here, including internal (client-credentials) tokens: same issuer,
    // same JWKS, just a different `type`. Previously this method assumed
    // `type === 'access'` and read store_id/role/perms unconditionally,
    // which would happily hand back an AuthenticatedUser with
    // storeId/role === undefined and perms === [] for an internal token —
    // not rejected, just silently broken, and any route relying only on
    // JwtAuthGuard (no PermissionsGuard) would let it through. Reject
    // explicitly instead. Internal tokens authenticate via
    // InternalAuthGuard/InternalTokenVerifierService, never this path.
    if (payload.type !== 'access') {
      throw new UnauthorizedException(
        'This token cannot be used to authenticate as a user',
      );
    }
    return {
      id: payload.sub,
      storeId: payload.store_id,
      role: payload.role,
      perms: payload.perms ?? [],
    };
  }
}
