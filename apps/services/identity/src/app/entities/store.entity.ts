import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { Membership } from './membership.entity';

/** Tenant ("Ecomiq Store"). */
@Entity({ name: 'store' })
export class Store extends BaseEntity {
  @Column({ type: 'text' })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'citext', unique: true })
  slug!: string;

  @Column({ type: 'text', name: 'logo_file_id', nullable: true })
  logoFileId!: string | null;

  @Column({ type: 'char', length: 3, name: 'default_currency', default: 'USD' })
  defaultCurrency!: string;

  @Column({ type: 'char', length: 2, name: 'country_code', nullable: true })
  countryCode!: string | null;

  @Column({ type: 'citext', name: 'support_email', nullable: true })
  supportEmail!: string | null;

  @Column({ type: 'text', default: 'trial' })
  plan!: string;

  @Column({ type: 'text', name: 'organization_name', nullable: true })
  organizationName!: string | null;

  @Column({ type: 'text', name: 'category', nullable: true })
  category!: string | null;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;

  @OneToMany(() => Membership, (m) => m.store)
  memberships?: Membership[];
}
