import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { Store } from './store.entity';
import { AppUser } from './app-user.entity';

/** Store-scoped API key for programmatic access — identity_db per §4. */
@Entity({ name: 'api_key' })
export class ApiKey extends BaseEntity {
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'store_id' })
  store?: Store;

  @Column({ type: 'text' })
  name!: string;

  /** SHA-256 hash; the raw key is shown once at creation time and never stored */
  @Column({ type: 'text', name: 'key_hash', unique: true })
  keyHash!: string;

  /** first 8 chars of the raw key, shown in listings so users can tell keys apart */
  @Column({ type: 'text', name: 'key_prefix' })
  keyPrefix!: string;

  @Column({ type: 'text', name: 'created_by' })
  createdBy!: string;

  @ManyToOne(() => AppUser, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: AppUser;

  @Column({ type: 'timestamptz', name: 'last_used_at', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
