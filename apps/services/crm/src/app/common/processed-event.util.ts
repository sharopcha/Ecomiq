import { EntityManager } from 'typeorm';

/**
 * Claims `(eventId, handler)` for processing — `ON CONFLICT DO NOTHING ...
 * RETURNING event_id`, so a replayed event is a safe no-op at the DB level
 * and the caller can still tell which outcome happened. Returns `true` the
 * first time (caller should proceed with its mutation, in the *same*
 * transaction as this claim), `false` on every replay (caller should skip).
 *
 * Two TypeORM QueryBuilder APIs were tried and rejected here (both caught
 * live by `crm:rollup-demo`'s duplicate-event check, not by `tsc`):
 * `InsertResult.identifiers` always has one entry per row passed to
 * `.values()` regardless of whether Postgres actually inserted it or
 * silently skipped a conflict — it's built from the *input* value set, not
 * the query result. `InsertResult.raw` isn't better: for an `INSERT`
 * command specifically, `PostgresQueryRunner.query()` sets `result.raw =
 * raw.rows` (discarding `rowCount`/`affected` entirely — that path is only
 * taken for `UPDATE`/`DELETE`). Raw SQL with an explicit `RETURNING` is the
 * only unambiguous signal: a conflicted insert returns zero rows.
 */
export async function claimEventForHandler(
  manager: EntityManager,
  eventId: string,
  handler: string,
): Promise<boolean> {
  const rows: unknown[] = await manager.query(
    `INSERT INTO processed_event (event_id, handler) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id`,
    [eventId, handler],
  );
  return rows.length > 0;
}
