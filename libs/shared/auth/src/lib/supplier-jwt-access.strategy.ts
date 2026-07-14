import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';
import { AuthenticatedSupplier, SupplierJwtPayload } from './supplier-jwt-payload.interface';

export const SUPPLIER_AUTH_MODULE_OPTIONS = 'SUPPLIER_AUTH_MODULE_OPTIONS';

export interface SupplierAuthSharedModuleOptions {
  /** purchasing-service's own JWKS endpoint, e.g. http://localhost:3010/api/auth/jwks — never identity's or crm's. */
  jwksUri: string;
  /** must match PURCHASING_JWT_ISSUER used by purchasing-service when signing (default 'ecomiq-purchasing-supplier') */
  issuer?: string;
  /** ms to cache a given JWKS key before refetching (default 10 min) */
  jwksCacheMaxAge?: number;
}

/**
 * Validates RS256 supplier access tokens against purchasing-service's own
 * published JWKS — entirely separate keypair/issuer/JWKS endpoint from
 * `JwtAccessStrategy`'s staff verification and `CustomerJwtAccessStrategy`'s
 * customer verification. Registered under the strategy name
 * 'jwt-supplier-access' so none of the three ever collide even when all are
 * registered in the same app.
 */
@Injectable()
export class SupplierJwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-supplier-access') {
  constructor(@Inject(SUPPLIER_AUTH_MODULE_OPTIONS) options: SupplierAuthSharedModuleOptions) {
    super({
      jwtFromRequest: (req: { headers?: { authorization?: string } }) => {
        const header = req?.headers?.authorization;
        if (header?.startsWith('Bearer ')) return header.slice(7);
        return null;
      },
      ignoreExpiration: false,
      issuer: options.issuer ?? 'ecomiq-purchasing-supplier',
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

  validate(payload: SupplierJwtPayload): AuthenticatedSupplier {
    if (payload.type !== 'supplier_access' || payload.aud !== 'supplier') {
      throw new UnauthorizedException('This token cannot be used to authenticate as a supplier');
    }
    return {
      id: payload.sub,
      storeId: payload.store_id,
    };
  }
}
