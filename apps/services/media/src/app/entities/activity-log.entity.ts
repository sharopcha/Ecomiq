import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';

/**
 * media-service's own local copy of order-service's `activity_log` shape —
 * polymorphism via `subjectTable` + `subjectId` (not a `kind` column).
 * `subjectTable: 'file'` for every row this service writes, whether the
 * subject is a `file_folder` or `file_asset` row — one File Library
 * activity feed, not one per underlying table.
 */
@Entity('activity_log')
@Index(['subjectTable', 'subjectId', 'createdAt'])
export class ActivityLog extends BaseEntity {
  @Index()
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @Column({ type: 'text', name: 'subject_table' })
  subjectTable!: string;

  @Column({ type: 'text', name: 'subject_id' })
  subjectId!: string;

  @Column({ type: 'text', name: 'actor_id', nullable: true })
  actorId?: string | null;

  @Column({ type: 'text', name: 'actor_kind', default: 'user' })
  actorKind!: string;

  @Column({ type: 'text' })
  verb!: string;

  @Column({ type: 'jsonb', nullable: true })
  data?: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
