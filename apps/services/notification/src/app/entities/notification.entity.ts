import { Column, Entity } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

/**
 * `notification` (`ECOMIQ-DATA-MODEL.md` §10) — the in-app bell feed (the
 * badge "32").
 *
 * `userId` is a plain nullable column, not a real FK — `app_user` belongs
 * to identity-service's own database (ADR-2, DB-per-service), same
 * reasoning as `EmailTemplate.createdBy`. `null` means a store-wide
 * broadcast (every staff user in the store sees it); set means it's
 * targeted at exactly one staff user.
 *
 * `kind` is a free-form string (not an enum like `EmailTemplate.kind`) —
 * producers across Steps 6-10 each stamp their own value
 * (`refund_failed_staff_alert`, `stock_low`, `return_approved`, ...) and
 * nothing here needs to enumerate them up front.
 */
@Entity('notification')
export class Notification extends TenantScopedEntity {
  @Column({ type: 'text', name: 'user_id', nullable: true })
  userId!: string | null;

  @Column({ type: 'text' })
  kind!: string;

  @Column({ type: 'text', nullable: true })
  title!: string | null;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ type: 'text', name: 'ref_table', nullable: true })
  refTable!: string | null;

  @Column({ type: 'text', name: 'ref_id', nullable: true })
  refId!: string | null;

  @Column({ type: 'timestamptz', name: 'read_at', nullable: true })
  readAt!: Date | null;
}
