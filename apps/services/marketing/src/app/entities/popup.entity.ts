import { Column, Entity } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

export enum PopupStatus {
  Draft = 'draft',
  Active = 'active',
  Archived = 'archived',
}

/**
 * Popup — a storefront-embedded widget (email capture, promo banner,
 * etc.), not tied to a `Campaign`. `schema` describes the widget's own
 * configurable content (loose jsonb shape, same "no real need to
 * normalize yet" reasoning as `Campaign.audience`/`contentRef`);
 * `displayRules` describes when/where it shows (e.g. page targeting,
 * exit-intent, delay) — also jsonb, interpreted only by whatever
 * storefront-rendering code eventually consumes it (out of scope here).
 */
@Entity('popup')
export class Popup extends TenantScopedEntity {
  @Column({ type: 'jsonb' })
  schema!: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'display_rules', nullable: true })
  displayRules?: Record<string, unknown> | null;

  @Column({
    type: 'enum',
    enum: PopupStatus,
    enumName: 'popup_status',
    default: PopupStatus.Draft,
  })
  status!: PopupStatus;
}
