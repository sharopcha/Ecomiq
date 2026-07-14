import { EntityManager } from 'typeorm';

/**
 * Claims `(eventId, handler)` for processing — `ON CONFLICT DO NOTHING ...
 * RETURNING event_id`. Copied unchanged from crm-service's
 * `processed-event.util.ts`: TypeORM's `InsertResult.identifiers`/`.raw`
 * are both unreliable "did this row actually get inserted" signals for an
 * `.orIgnore()` insert (see that file's doc comment for the full story,
 * caught live by crm's `rollup-demo`) — raw SQL with an explicit
 * `RETURNING` is the only unambiguous one.
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
