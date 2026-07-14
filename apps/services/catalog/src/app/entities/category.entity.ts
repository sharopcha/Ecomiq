import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

/**
 * Self-referential tree via `parent_id`. Only the relation is declared (no
 * separate plain `parentId` column) — TypeORM would otherwise generate two
 * conflicting mappings for the same physical column. Services read/write the
 * parent id through `category.parent?.id` / `category.parent = { id } as Category`.
 */
@Entity('category')
export class Category extends TenantScopedEntity {
  @Column({ type: 'text' })
  name!: string;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent?: Category | null;
}
