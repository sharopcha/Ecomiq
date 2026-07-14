import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';

/**
 * Polymorphic activity feed — every mutation writes `activity_log`. Same
 * `(subjectTable, subjectId)` addressing as `OrderComment`, and the same
 * reason: one table serving
 * order/`return_request`/`refund` subjects without a real FK to any single
 * parent type.
 *
 * `actorId` is nullable + `actorKind` defaults to `'user'` — a `'system'`
 * actor (the checkout saga, an expiry handler) has no `app_user.id` to
 * point at.
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

  /** Opaque `app_user.id` when a human acted, null for system-driven entries (ADR-2, no relation). */
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
