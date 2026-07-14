import { EntityManager } from 'typeorm';
import { StoreSequence } from '../entities/store-sequence.entity';

/**
 * Claims the next `store_sequence` value for `(storeId, kind)` — the
 * mechanism behind `SHP-<n>` shipment display ids, copied unchanged from
 * order-service's `store-sequence.util.ts` (the `RMA-<n>` precedent).
 *
 * `.orIgnore()` (Postgres `ON CONFLICT DO NOTHING`) handles the one-time
 * race of two concurrent *first-ever* claims for a brand-new
 * `(storeId, kind)` pair; the `SELECT ... FOR UPDATE` below is what
 * actually serializes concurrent claims from that point on.
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
