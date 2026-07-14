import { Column, Entity } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

/**
 * Matches the `template_kind` Postgres enum (`ECOMIQ-DATA-MODEL.md` line
 * 48) — every channel/event reaction this plan builds (Steps 6-10) picks a
 * template by one of these kinds.
 */
export enum TemplateKind {
  OrderNotification = 'order_notification',
  ShipmentDelay = 'shipment_delay',
  ReturnApproval = 'return_approval',
  Refund = 'refund',
  PurchaseOrder = 'purchase_order',
  Campaign = 'campaign',
  Custom = 'custom',
  /** crm-service's customer register flow (`notify.send` template `welcome`). */
  Welcome = 'welcome',
  /** crm-service's review-request flow (`notify.send` template `review_request`). */
  ReviewRequest = 'review_request',
}

/**
 * `email_template` (`ECOMIQ-DATA-MODEL.md` §10) — the template picker +
 * "Save Template" + AI-recommended templates. `subject`/`body` carry
 * `{{Customer_name}}`-style variables interpolated by
 * `render-template.util.ts` at send time.
 *
 * `createdBy` is a plain nullable column, not a real FK — `app_user`
 * belongs to identity-service's own database (ADR-2, DB-per-service), so
 * there's nothing to reference across service boundaries.
 */
@Entity('email_template')
export class EmailTemplate extends TenantScopedEntity {
  @Column({
    type: 'enum',
    enum: TemplateKind,
    enumName: 'template_kind',
    default: TemplateKind.Custom,
  })
  kind!: TemplateKind;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  subject!: string | null;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ type: 'boolean', name: 'is_ai_recommended', default: false })
  isAiRecommended!: boolean;

  @Column({ type: 'text', name: 'created_by', nullable: true })
  createdBy!: string | null;
}
