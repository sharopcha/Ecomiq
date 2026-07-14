import { Column, Entity } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

@Entity('vendor')
export class Vendor extends TenantScopedEntity {
  @Column({ type: 'text' })
  name!: string;
}
