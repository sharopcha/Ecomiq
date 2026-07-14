import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';

export enum CommentVisibility {
  StaffOnly = 'staff_only',
  Public = 'public',
}

/**
 * Polymorphic comment thread — scoped to whichever order-service subject
 * needs one (order, RMA `return_request`, `refund`), addressed by
 * `(subjectTable, subjectId)`
 * rather than a real FK, since one table serves multiple unrelated parent
 * types. `authorId` is a plain text column — identity owns `app_user`
 * (ADR-2, no cross-DB FK).
 *
 * Extends `BaseEntity` (id + manual `storeId`, no `updatedAt`) — comments
 * aren't edited in this data model, same append-only reasoning as
 * `Invoice`.
 */
@Entity('comment')
@Index(['subjectTable', 'subjectId', 'createdAt'])
export class OrderComment extends BaseEntity {
  @Index()
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @Column({ type: 'text', name: 'subject_table' })
  subjectTable!: string;

  @Column({ type: 'text', name: 'subject_id' })
  subjectId!: string;

  /** Opaque `app_user.id` — identity-owned, no relation (ADR-2). */
  @Column({ type: 'text', name: 'author_id', nullable: true })
  authorId?: string | null;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'text', array: true, name: 'attachment_file_ids', nullable: true })
  attachmentFileIds?: string[] | null;

  @Column({
    type: 'enum',
    enum: CommentVisibility,
    enumName: 'comment_visibility',
    default: CommentVisibility.StaffOnly,
  })
  visibility!: CommentVisibility;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
