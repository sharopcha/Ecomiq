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

export async function writeActivityLog(
  manager: EntityManager,
  input: WriteActivityLogInput,
): Promise<void> {
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
