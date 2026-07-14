import { UnauthorizedException } from '@nestjs/common';
import { CustomerJwtAccessStrategy } from './customer-jwt-access.strategy';
import { CustomerJwtPayload } from './customer-jwt-payload.interface';

/**
 * `validate()` is pure given a decoded payload (no network/JWKS I/O — that
 * already happened by the time passport-jwt calls this) — same rationale
 * as `jwt-access.strategy.spec.ts`, which this file mirrors for the
 * customer-token side.
 */
describe('CustomerJwtAccessStrategy#validate', () => {
  const strategy = new CustomerJwtAccessStrategy({
    jwksUri: 'http://localhost:3009/api/auth/jwks',
    issuer: 'ecomiq-crm-customer',
  });

  it('maps a customer access-token payload to AuthenticatedCustomer', () => {
    const payload: CustomerJwtPayload = {
      sub: 'customer_123',
      store_id: 'store_456',
      aud: 'customer',
      type: 'customer_access',
      iss: 'ecomiq-crm-customer',
      iat: 0,
      exp: 0,
      jti: 'jti_1',
    };
    expect(strategy.validate(payload)).toEqual({ id: 'customer_123', storeId: 'store_456' });
  });

  it('rejects a staff access-token payload (type "access", no aud "customer")', () => {
    const staffShapedPayload = {
      sub: 'user_123',
      store_id: 'store_456',
      role: 'staff',
      perms: ['orders:read'],
      type: 'access',
      iss: 'ecomiq-identity',
      iat: 0,
      exp: 0,
      jti: 'jti_2',
    } as unknown as CustomerJwtPayload;
    expect(() => strategy.validate(staffShapedPayload)).toThrow(UnauthorizedException);
  });

  it('rejects a payload with the right type but the wrong aud (belt-and-suspenders check)', () => {
    const payload = {
      sub: 'customer_123',
      store_id: 'store_456',
      aud: 'internal',
      type: 'customer_access',
      iss: 'ecomiq-crm-customer',
      iat: 0,
      exp: 0,
      jti: 'jti_3',
    } as unknown as CustomerJwtPayload;
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });

  it('rejects a payload with the right aud but the wrong type', () => {
    const payload = {
      sub: 'customer_123',
      store_id: 'store_456',
      aud: 'customer',
      type: 'mfa_challenge',
      iss: 'ecomiq-crm-customer',
      iat: 0,
      exp: 0,
      jti: 'jti_4',
    } as unknown as CustomerJwtPayload;
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });

  it('rejects a purchasing-service supplier access-token payload (wrong principal entirely)', () => {
    // Completes the three-way cross-rejection matrix alongside this file's
    // staff-rejection case and supplier-jwt-access.strategy.spec.ts's own
    // staff/customer-rejection cases.
    const payload = {
      sub: 'supplier_123',
      store_id: 'store_456',
      aud: 'supplier',
      type: 'supplier_access',
      iss: 'ecomiq-purchasing-supplier',
      iat: 0,
      exp: 0,
      jti: 'jti_5',
    } as unknown as CustomerJwtPayload;
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });
});
