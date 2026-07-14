import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { Membership } from './membership.entity';

/** Platform-level identity. */
@Entity({ name: 'app_user' })
export class AppUser extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'citext', unique: true })
  email!: string;

  /** null when the account is OAuth-only (Google) */
  @Column({ type: 'text', name: 'password_hash', nullable: true })
  passwordHash!: string | null;

  @Column({ type: 'text', name: 'full_name', nullable: true })
  fullName!: string | null;

  @Column({ type: 'text', name: 'country_code', nullable: true })
  countryCode!: string | null;

  @Column({ type: 'text', name: 'language', nullable: true })
  language!: string | null;

  @Column({ type: 'text', name: 'avatar_file_id', nullable: true })
  avatarFileId!: string | null;

  /** TOTP secret (base32), set once 2FA setup is initiated — [GAP] per data model, see ADR-5 */
  @Column({ type: 'text', name: 'totp_secret', nullable: true, select: false })
  totpSecret!: string | null;

  /** true only after the user confirms a code during /auth/2fa/enable */
  @Column({ type: 'boolean', name: 'totp_enabled', default: false })
  totpEnabled!: boolean;

  /** Google OAuth2 subject id, when the account is linked to Google */
  @Index({ unique: true, where: 'google_id IS NOT NULL' })
  @Column({ type: 'text', name: 'google_id', nullable: true })
  googleId!: string | null;

  @Column({ type: 'timestamptz', name: 'email_verified_at', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'last_login_at', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'updated_at', default: () => 'now()' })
  updatedAt!: Date;

  @OneToMany(() => Membership, (m) => m.user)
  memberships?: Membership[];
}
