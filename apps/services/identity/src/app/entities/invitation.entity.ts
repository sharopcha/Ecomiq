import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { Store } from './store.entity';
import { AppUser } from './app-user.entity';
import { Role } from '@temp-nx/auth';

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

/**
 * Staff invitation to join a store with a given role. Owned by identity_db.
 */
@Entity({ name: 'invitation' })
@Index(['storeId', 'email'], {
  unique: true,
  where: `status = 'pending'`,
})
export class Invitation extends BaseEntity {
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'store_id' })
  store?: Store;

  @Column({ type: 'citext' })
  email!: string;

  @Column({ type: 'text', default: 'staff' })
  role!: Role;

  /** SHA-256 hash of the opaque token emailed to the invitee (raw token never persisted) */
  @Column({ type: 'text', name: 'token_hash' })
  tokenHash!: string;

  @Column({ type: 'text', name: 'invited_by' })
  invitedBy!: string;

  @ManyToOne(() => AppUser, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'invited_by' })
  inviter?: AppUser;

  @Column({ type: 'text', default: 'pending' })
  status!: InvitationStatus;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', name: 'accepted_at', nullable: true })
  acceptedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
