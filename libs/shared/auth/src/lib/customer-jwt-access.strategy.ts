import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';
import { AuthenticatedCustomer, CustomerJwtPayload } from './customer-jwt-payload.interface';

export const CUSTOMER_AUTH_MODULE_OPTIONS = 'CUSTOMER_AUTH_MODULE_OPTIONS';

export interface CustomerAuthSharedModuleOptions {
  /** crm-service's own JWKS endpoint, e.g. http://localhost:3009/api/auth/jwks — never identity's. */
  jwksUri: string;
  /** must match CRM_JWT_ISSUER used by crm-service when signing (default 'ecomiq-crm-customer') */
  issuer?: string;
  /** ms to cache a given JWKS key before refetching (default 10 min) */
  jwksCacheMaxAge?: number;
}

/**
 * Validates RS256 customer access tokens against crm-service's own
 * published JWKS — entirely separate keypair/issuer/JWKS endpoint from
 * `JwtAccessStrategy`'s staff verification. Registered under the strategy
 * name 'jwt-customer-access' so the two never collide even when both are
 * registered in the same app (crm-service verifies staff tokens for its
 * admin endpoints and customer tokens for its `/storefront` endpoints).
 */
@Injectable()
export class CustomerJwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-customer-access') {
  constructor(@Inject(CUSTOMER_AUTH_MODULE_OPTIONS) options: CustomerAuthSharedModuleOptions) {
    super({
      jwtFromRequest: (req: { headers?: { authorization?: string } }) => {
        const header = req?.headers?.authorization;
        if (header?.startsWith('Bearer ')) return header.slice(7);
        return null;
      },
      ignoreExpiration: false,
      issuer: options.issuer ?? 'ecomiq-crm-customer',
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

  validate(payload: CustomerJwtPayload): AuthenticatedCustomer {
    if (payload.type !== 'customer_access' || payload.aud !== 'customer') {
      throw new UnauthorizedException('This token cannot be used to authenticate as a customer');
    }
    return {
      id: payload.sub,
      storeId: payload.store_id,
    };
  }
}
