import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';
import { Campaign } from './campaign.entity';

/**
 * One row per recipient of a fired campaign (expanded by the fire
 * handler, updated by the engagement write-back endpoint). Extends
 * `BaseEntity` (id only), not
 * `TenantScopedEntity` — same reasoning as `DiscountUsage`: `storeId` is
 * added manually, and there's no `updatedAt` semantic beyond the four
 * explicit engagement timestamps this row already carries.
 *
 * `customerId` is a plain text column, not a relation — it references
 * order-service's/identity's own tables in a different database (ADR-2).
 */
@Entity('campaign_send')
export class CampaignSend extends BaseEntity {
  @Index()
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @Index()
  @ManyToOne(() => Campaign, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: Campaign;

  @Column({ type: 'text' })
  recipient!: string;

  @Index()
  @Column({ type: 'text', name: 'customer_id', nullable: true })
  customerId?: string | null;

  @Column({ type: 'timestamptz', name: 'sent_at', nullable: true })
  sentAt?: Date | null;

  @Column({ type: 'timestamptz', name: 'opened_at', nullable: true })
  openedAt?: Date | null;

  @Column({ type: 'timestamptz', name: 'clicked_at', nullable: true })
  clickedAt?: Date | null;

  @Column({ type: 'timestamptz', name: 'bounced_at', nullable: true })
  bouncedAt?: Date | null;
}
