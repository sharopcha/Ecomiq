import { EntityManager } from 'typeorm';
import { ActivityLog } from '../entities/activity-log.entity';

export interface WriteActivityLogInput {
  storeId: string;
  subjectTable: string;
  subjectId: string;
  verb: string;
  actorId?: string | null;
  actorKind?: string;
  data?: Record<string, unknown> | null;
}

/**
 * Every mutation writes `activity_log`. One shared writer rather than a
 * copy per module — `ActivityLog` is
 * already polymorphic by design (`subjectTable`/`subjectId`, see its own
 * doc comment), so a single insert helper covers `order` and
 * `return_request`/`refund` without any change here.
 * Call with the *same* manager/transaction as the domain mutation, same
 * "pass the manager in" convention as `recordOutboxEvent`.
 */
export async function writeActivityLog(manager: EntityManager, input: WriteActivityLogInput): Promise<void> {
  const row = manager.create(ActivityLog, {
    storeId: input.storeId,
    subjectTable: input.subjectTable,
    subjectId: input.subjectId,
    actorId: input.actorId ?? null,
    actorKind: input.actorKind ?? 'user',
    verb: input.verb,
    data: input.data ?? null,
  });
  await manager.save(row);
}
