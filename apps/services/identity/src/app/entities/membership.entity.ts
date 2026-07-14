import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { Store } from './store.entity';
import { AppUser } from './app-user.entity';
import { Role } from '@temp-nx/auth';

/** owner|admin|staff per (store, user). */
@Entity({ name: 'membership' })
@Index(['storeId', 'userId'], { unique: true })
export class Membership extends BaseEntity {
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @ManyToOne(() => Store, (s) => s.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'store_id' })
  store?: Store;

  @Column({ type: 'text', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => AppUser, (u) => u.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: AppUser;

  @Column({ type: 'text', default: 'staff' })
  role!: Role;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
