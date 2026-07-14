import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

export enum ReferralStatus {
  Pending = 'pending',
  Completed = 'completed',
}

/**
 * `referrer_id`/`referee_id` are same-DB FKs (both `customer` rows live in
 * crm_db). `referrer_id` starts null when a referee registers with a code
 * that doesn't (yet) match any customer's own `referral_code` — the
 * referral code-generation step resolves those once it ships; nothing
 * re-scans existing rows automatically, that's a future backfill concern,
 * not this table's.
 */
@Entity('referral')
export class Referral extends TenantScopedEntity {
  @Index()
  @Column({ type: 'text', name: 'referrer_id', nullable: true })
  referrerId?: string | null;

  @Index()
  @Column({ type: 'text', name: 'referee_id' })
  refereeId!: string;

  @Column({ type: 'text' })
  code!: string;

  @Column({ type: 'text', default: ReferralStatus.Pending })
  status!: ReferralStatus;
}
