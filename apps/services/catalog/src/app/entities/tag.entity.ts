import { Column, Entity, Unique } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

/** citext + (store_id, name) uniqueness — case-insensitive per store. */
@Entity('tag')
@Unique(['storeId', 'name'])
export class Tag extends TenantScopedEntity {
  @Column({ type: 'citext' })
  name!: string;
}
