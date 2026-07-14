import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MoneyTransformer, TenantScopedEntity } from '@temp-nx/typeorm';
import { Campaign } from './campaign.entity';

export enum AdPlatform {
  Meta = 'meta',
  Google = 'google',
}

/**
 * Ad — tied to a parent `Campaign` (`kind: 'ads'`), one per platform. No
 * live platform connectors exist (`AdPlatformPort`'s only adapter today is
 * a logging stub — see `ad-platform.port.ts`) — this entity is the durable
 * record of intent; `stats` stays empty until a real connector exists to
 * populate it.
 */
@Entity('ad')
export class Ad extends TenantScopedEntity {
  @Index()
  @ManyToOne(() => Campaign, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: Campaign;

  @Column({ type: 'enum', enum: AdPlatform, enumName: 'ad_platform' })
  platform!: AdPlatform;

  @Column({ type: 'jsonb', nullable: true })
  audience?: Record<string, unknown> | null;

  @Column({ type: 'bigint', name: 'budget_minor', default: 0, transformer: MoneyTransformer })
  budgetMinor!: number;

  @Column({ type: 'timestamptz', name: 'starts_at', nullable: true })
  startsAt?: Date | null;

  @Column({ type: 'timestamptz', name: 'ends_at', nullable: true })
  endsAt?: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  stats?: Record<string, unknown> | null;
}
