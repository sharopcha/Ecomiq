import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

/**
 * Self-referential tree via `parent_id` — same shape as catalog's
 * `Category`, with one deliberate difference: no `onDelete: 'SET NULL'`
 * here. Folders enforce "delete only if empty" at the application layer
 * (`FoldersService.remove`); leaving the FK at Postgres's default
 * RESTRICT means a bug that skips that check still can't orphan a folder's
 * children by silently unparenting them — the delete just fails at the DB.
 */
@Entity('file_folder')
export class FileFolder extends TenantScopedEntity {
  @Column({ type: 'text' })
  name!: string;

  @ManyToOne(() => FileFolder, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent?: FileFolder | null;
}
