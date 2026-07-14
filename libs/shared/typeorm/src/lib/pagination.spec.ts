import type { SelectQueryBuilder } from 'typeorm';
import { paginate } from './pagination';

interface MockQb {
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
}

/** Minimal chainable mock of the subset of SelectQueryBuilder that paginate() uses. */
function mockQb(rows: { id: string }[]): SelectQueryBuilder<{ id: string }> & MockQb {
  const qb = {} as MockQb;
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.orderBy = jest.fn().mockReturnValue(qb);
  qb.take = jest.fn().mockReturnValue(qb);
  qb.getMany = jest.fn().mockResolvedValue(rows);
  return qb as unknown as SelectQueryBuilder<{ id: string }> & MockQb;
}

describe('paginate', () => {
  it('does not add a cursor clause when no cursor is given', async () => {
    const qb = mockQb([{ id: '1' }, { id: '2' }]);

    await paginate(qb, 'product', { limit: 20 });

    expect(qb.andWhere).not.toHaveBeenCalled();
    expect(qb.orderBy).toHaveBeenCalledWith('product.id', 'ASC');
    expect(qb.take).toHaveBeenCalledWith(21); // limit + 1 lookahead
  });

  it('adds an id > :cursor clause when a cursor is given', async () => {
    const qb = mockQb([]);

    await paginate(qb, 'product', { cursor: 'abc', limit: 20 });

    expect(qb.andWhere).toHaveBeenCalledWith('product.id > :cursor', { cursor: 'abc' });
  });

  it('returns all rows and a null nextCursor when fewer than limit+1 rows come back', async () => {
    const rows = [{ id: '1' }, { id: '2' }];
    const qb = mockQb(rows);

    const result = await paginate(qb, 'product', { limit: 20 });

    expect(result.items).toEqual(rows);
    expect(result.nextCursor).toBeNull();
  });

  it('slices off the lookahead row and sets nextCursor to the last kept row id when there are more', async () => {
    // limit 2 -> query fetches 3; 3 rows back means "there's more"
    const rows = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const qb = mockQb(rows);

    const result = await paginate(qb, 'product', { limit: 2 });

    expect(result.items).toEqual([{ id: '1' }, { id: '2' }]);
    expect(result.nextCursor).toBe('2');
  });

  it('returns an empty page with a null cursor when there are no rows', async () => {
    const qb = mockQb([]);

    const result = await paginate(qb, 'product', { limit: 20 });

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});
