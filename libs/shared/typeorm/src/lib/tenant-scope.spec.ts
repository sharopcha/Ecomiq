import type { SelectQueryBuilder } from 'typeorm';
import { assertOwnedByStore, scopeToStore } from './tenant-scope';

describe('scopeToStore', () => {
  it('adds a store_id andWhere clause scoped to the given alias', () => {
    const andWhere = jest.fn().mockReturnThis();
    const qb = { andWhere } as unknown as SelectQueryBuilder<never>;

    const result = scopeToStore(qb, 'product', 'store-123');

    expect(andWhere).toHaveBeenCalledWith('product.store_id = :storeId', {
      storeId: 'store-123',
    });
    expect(result).toBe(qb);
  });
});

describe('assertOwnedByStore', () => {
  it('returns the entity when it belongs to the given store', () => {
    const entity = { id: '1', storeId: 'store-a' };
    expect(assertOwnedByStore(entity, 'store-a', () => new Error('unreachable'))).toBe(entity);
  });

  it('throws the caller-supplied error when the entity is null', () => {
    expect(() =>
      assertOwnedByStore(null, 'store-a', () => new Error('not found')),
    ).toThrow('not found');
  });

  it('throws the caller-supplied error when the entity is undefined', () => {
    expect(() =>
      assertOwnedByStore(undefined, 'store-a', () => new Error('not found')),
    ).toThrow('not found');
  });

  it('throws when the entity belongs to a different store (cross-tenant access)', () => {
    const entity = { id: '1', storeId: 'store-b' };
    expect(() =>
      assertOwnedByStore(entity, 'store-a', () => new Error('not found')),
    ).toThrow('not found');
  });

  it('gives cross-tenant access and missing rows the same error, by design', () => {
    const notFoundFactory = () => new Error('not found');
    let missingErr: unknown;
    let crossTenantErr: unknown;
    try {
      assertOwnedByStore(null, 'store-a', notFoundFactory);
    } catch (e) {
      missingErr = e;
    }
    try {
      assertOwnedByStore({ id: '1', storeId: 'store-b' }, 'store-a', notFoundFactory);
    } catch (e) {
      crossTenantErr = e;
    }
    expect((missingErr as Error).message).toBe((crossTenantErr as Error).message);
  });
});
