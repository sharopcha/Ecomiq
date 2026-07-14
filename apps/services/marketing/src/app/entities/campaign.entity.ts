import { Column, Entity } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

export enum CampaignKind {
  Email = 'email',
  Ads = 'ads',
  Popup = 'popup',
  Form = 'form',
  Coupon = 'coupon',
}

export enum CampaignStatus {
  Draft = 'draft',
  Scheduled = 'scheduled',
  Sending = 'sending',
  Sent = 'sent',
  Paused = 'paused',
  Archived = 'archived',
}

/**
 * Marketing campaign — the parent aggregate for every kind of outbound
 * marketing activity (`kind` discriminates email/ads/popup/form/coupon;
 * ads/popups/forms get their own dedicated entities, `campaign` is just
 * their scheduling/status shell).
 *
 * `audience`/`contentRef`/`stats` are jsonb rather than normalized tables —
 * no segment/template system exists yet, so these are intentionally loose
 * shape until a real need forces a schema.
 *
 * `scheduleAt` + `status: scheduled` is armed by the delayed Pulsar
 * message; `sending`/`sent` are written by that same fire handler, never by
 * a direct API call (see `campaigns.service.ts`'s `schedule()`/`pause()` —
 * neither transitions into `sending`/`sent`).
 */
@Entity('campaign')
export class Campaign extends TenantScopedEntity {
  @Column({ type: 'enum', enum: CampaignKind, enumName: 'campaign_kind' })
  kind!: CampaignKind;

  @Column({ type: 'text' })
  title!: string;

  @Column({
    type: 'enum',
    enum: CampaignStatus,
    enumName: 'campaign_status',
    default: CampaignStatus.Draft,
  })
  status!: CampaignStatus;

  @Column({ type: 'timestamptz', name: 'schedule_at', nullable: true })
  scheduleAt?: Date | null;

  /** Recipient email list today; falls back to this when `segmentId` is unset or has no snapshot yet. */
  @Column({ type: 'jsonb', nullable: true })
  audience?: Record<string, unknown> | null;

  /**
   * Opaque reference to a crm-service segment (ADR-2 — no cross-DB FK).
   * When set, `fire()` resolves recipients from that segment's
   * `segment_snapshot` row instead of `audience.emails`; `audience` stays
   * as the fallback if the snapshot hasn't arrived yet or `segmentId` is
   * unset.
   */
  @Column({ type: 'text', name: 'segment_id', nullable: true })
  segmentId?: string | null;

  /** Template/subject/body for `kind: email`; unused shape for other kinds. */
  @Column({ type: 'jsonb', name: 'content_ref', nullable: true })
  contentRef?: Record<string, unknown> | null;

  /** Denormalized counters (e.g. totalRecipients) — the fire handler writes `totalRecipients` on fire. */
  @Column({ type: 'jsonb', nullable: true })
  stats?: Record<string, unknown> | null;
}
