import { EntityManager } from 'typeorm';
import { StoreSequence } from '../entities/store-sequence.entity';

/**
 * Claims the next `store_sequence` value for `(storeId, kind)` — the
 * mechanism behind every display id in order-service. All display ids come
 * from `store_sequence` inside the insert transaction (`SELECT … FOR
 * UPDATE`). `orders.service.ts` (kind
 * `'order'`) is the first caller; `returns.service.ts` (kind `'rma'`) and
 * the invoice endpoint (kind `'invoice'`) reuse this unchanged.
 *
 * `.orIgnore()` (Postgres `ON CONFLICT DO NOTHING`) handles the one-time
 * race of two concurrent *first-ever* claims for a brand-new
 * `(storeId, kind)` pair racing to insert the counter row — whichever loses
 * that race simply finds the winner's row already there. From that point on,
 * the `SELECT ... FOR UPDATE` below is what actually serializes concurrent
 * claims: every caller queues on the row lock and gets a strictly
 * increasing value, one at a time, no two callers ever observing the same
 * `nextValue`.
 *
 * Must be called with the same transaction manager as the row that
 * consumes the claimed number, so a rolled-back creation doesn't burn a
 * number.
 */
export async function claimNextSequenceNumber(
  manager: EntityManager,
  storeId: string,
  kind: string,
): Promise<number> {
  await manager
    .createQueryBuilder()
    .insert()
    .into(StoreSequence)
    .values({ storeId, kind, nextValue: 1 })
    .orIgnore()
    .execute();

  const row = await manager
    .createQueryBuilder(StoreSequence, 'seq')
    .setLock('pessimistic_write')
    .where('seq.store_id = :storeId AND seq.kind = :kind', { storeId, kind })
    .getOneOrFail();

  const claimed = row.nextValue;
  await manager.update(StoreSequence, { storeId, kind }, { nextValue: claimed + 1 });
  return claimed;
}
