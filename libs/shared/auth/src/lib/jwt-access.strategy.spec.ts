import { UnauthorizedException } from '@nestjs/common';
import { JwtAccessStrategy } from './jwt-access.strategy';
import { AnyEcomiqJwtPayload } from './jwt-payload.interface';

/**
 * `validate()` is pure given a decoded payload (no network/JWKS I/O — that
 * already happened by the time passport-jwt calls this) — the constructor
 * only wires up `passport-jwt`'s extraction/verification options, it
 * doesn't fetch anything, so it's safe to instantiate with dummy config
 * purely to exercise `validate()`.
 */
describe('JwtAccessStrategy#validate', () => {
  const strategy = new JwtAccessStrategy({
    jwksUri: 'http://localhost:3001/api/.well-known/jwks.json',
    issuer: 'ecomiq-identity',
  });

  it('maps a user access-token payload to AuthenticatedUser', () => {
    const payload: AnyEcomiqJwtPayload = {
      sub: 'user_123',
      store_id: 'store_456',
      role: 'staff',
      perms: ['orders:read'],
      type: 'access',
      iss: 'ecomiq-identity',
      iat: 0,
      exp: 0,
      jti: 'jti_1',
    };
    expect(strategy.validate(payload)).toEqual({
      id: 'user_123',
      storeId: 'store_456',
      role: 'staff',
      perms: ['orders:read'],
    });
  });

  it('defaults perms to [] when absent from an access payload', () => {
    const payload = {
      sub: 'user_123',
      store_id: 'store_456',
      role: 'owner',
      type: 'access',
      iss: 'ecomiq-identity',
      iat: 0,
      exp: 0,
      jti: 'jti_1',
    } as unknown as AnyEcomiqJwtPayload;
    expect(strategy.validate(payload).perms).toEqual([]);
  });

  it('rejects an internal (client-credentials) token rather than returning a broken user', () => {
    const payload: AnyEcomiqJwtPayload = {
      sub: 'client_order-service',
      svc: 'order-service',
      scope: ['inventory:reserve'],
      aud: 'internal',
      type: 'internal',
      iss: 'ecomiq-identity',
      iat: 0,
      exp: 0,
      jti: 'jti_2',
    };
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });

  it('rejects an mfa_challenge token', () => {
    const payload: AnyEcomiqJwtPayload = {
      sub: 'user_123',
      type: 'mfa_challenge',
      iss: 'ecomiq-identity',
      iat: 0,
      exp: 0,
      jti: 'jti_3',
    };
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });

  it('rejects a store_selection token', () => {
    const payload: AnyEcomiqJwtPayload = {
      sub: 'user_123',
      type: 'store_selection',
      iss: 'ecomiq-identity',
      iat: 0,
      exp: 0,
      jti: 'jti_4',
    };
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });

  it('rejects a crm-service customer access-token payload (wrong principal entirely)', () => {
    // The reverse of customer-jwt-access.strategy.spec.ts's staff-rejection
    // case — crm's `type: 'customer_access'` never satisfies this
    // strategy's `type !== 'access'` check, so a customer token can never
    // be accepted as a staff one either.
    const payload = {
      sub: 'customer_123',
      store_id: 'store_456',
      aud: 'customer',
      type: 'customer_access',
      iss: 'ecomiq-crm-customer',
      iat: 0,
      exp: 0,
      jti: 'jti_5',
    } as unknown as AnyEcomiqJwtPayload;
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });

  it('rejects a purchasing-service supplier access-token payload (wrong principal entirely)', () => {
    // Completes the three-way cross-rejection matrix alongside this file's
    // customer-rejection case and supplier-jwt-access.strategy.spec.ts's own
    // staff/customer-rejection cases — a supplier token's `type:
    // 'supplier_access'` never satisfies this strategy's `type !== 'access'`
    // check either.
    const payload = {
      sub: 'supplier_123',
      store_id: 'store_456',
      aud: 'supplier',
      type: 'supplier_access',
      iss: 'ecomiq-purchasing-supplier',
      iat: 0,
      exp: 0,
      jti: 'jti_6',
    } as unknown as AnyEcomiqJwtPayload;
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });
});
