import { UnauthorizedException } from '@nestjs/common';
import { SupplierJwtAccessStrategy } from './supplier-jwt-access.strategy';
import { SupplierJwtPayload } from './supplier-jwt-payload.interface';

/**
 * `validate()` is pure given a decoded payload (no network/JWKS I/O — that
 * already happened by the time passport-jwt calls this) — same rationale
 * as `jwt-access.strategy.spec.ts`/`customer-jwt-access.strategy.spec.ts`,
 * which this file mirrors for the third (supplier) principal.
 */
describe('SupplierJwtAccessStrategy#validate', () => {
  const strategy = new SupplierJwtAccessStrategy({
    jwksUri: 'http://localhost:3010/api/auth/jwks',
    issuer: 'ecomiq-purchasing-supplier',
  });

  it('maps a supplier access-token payload to AuthenticatedSupplier', () => {
    const payload: SupplierJwtPayload = {
      sub: 'supplier_123',
      store_id: 'store_456',
      aud: 'supplier',
      type: 'supplier_access',
      iss: 'ecomiq-purchasing-supplier',
      iat: 0,
      exp: 0,
      jti: 'jti_1',
    };
    expect(strategy.validate(payload)).toEqual({ id: 'supplier_123', storeId: 'store_456' });
  });

  it('rejects a staff access-token payload (type "access", no aud "supplier")', () => {
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
    } as unknown as SupplierJwtPayload;
    expect(() => strategy.validate(staffShapedPayload)).toThrow(UnauthorizedException);
  });

  it('rejects a crm-service customer access-token payload (wrong principal entirely)', () => {
    const customerShapedPayload = {
      sub: 'customer_123',
      store_id: 'store_456',
      aud: 'customer',
      type: 'customer_access',
      iss: 'ecomiq-crm-customer',
      iat: 0,
      exp: 0,
      jti: 'jti_3',
    } as unknown as SupplierJwtPayload;
    expect(() => strategy.validate(customerShapedPayload)).toThrow(UnauthorizedException);
  });

  it('rejects a payload with the right type but the wrong aud (belt-and-suspenders check)', () => {
    const payload = {
      sub: 'supplier_123',
      store_id: 'store_456',
      aud: 'internal',
      type: 'supplier_access',
      iss: 'ecomiq-purchasing-supplier',
      iat: 0,
      exp: 0,
      jti: 'jti_4',
    } as unknown as SupplierJwtPayload;
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });

  it('rejects a payload with the right aud but the wrong type', () => {
    const payload = {
      sub: 'supplier_123',
      store_id: 'store_456',
      aud: 'supplier',
      type: 'mfa_challenge',
      iss: 'ecomiq-purchasing-supplier',
      iat: 0,
      exp: 0,
      jti: 'jti_5',
    } as unknown as SupplierJwtPayload;
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });
});
