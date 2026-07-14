import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';
import { TemplateKind } from './email-template.entity';

export enum SendChannel {
  Email = 'email',
  Sms = 'sms',
  WhatsApp = 'whatsapp',
  InApp = 'in_app',
}

export enum SendStatus {
  Pending = 'pending',
  Sent = 'sent',
  Failed = 'failed',
  Dead = 'dead',
}

/**
 * `send_log` — the per-attempt delivery ledger for every dispatch this
 * service ever attempts (Step 6's `DispatchService` is the only writer).
 *
 * Extends `BaseEntity` (id only), not `TenantScopedEntity` — same reasoning
 * as inventory's `StockMovement`: `storeId` is added manually below without
 * the `updatedAt` column `TenantScopedEntity` would carry, since there's no
 * separate audit-timestamp need beyond the explicit `attempt` counter this
 * row already tracks. "Append-only" describes the row's lifecycle relative
 * to other tables in this repo (never deleted, never replaced) — the same
 * row *is* still updated in place across retries (`status`/`attempt`/
 * `providerMessageId` change as Step 6's retry loop runs), it just never
 * grows a second row per attempt.
 *
 * `sourceEventId` is unique — the idempotency key. A redelivered Pulsar
 * command/event maps to the exact same row via this column, so
 * `DispatchService.dispatch()` can treat a duplicate delivery as a no-op
 * (existing row already in a terminal state) rather than double-sending.
 *
 * `templateKind` reuses the `template_kind` Postgres enum `email_template`
 * already created (Step 3) — same logical domain, no reason for a second
 * enum type.
 */
@Entity('send_log')
export class SendLog extends BaseEntity {
  @Index()
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @Column({ type: 'enum', enum: SendChannel, enumName: 'send_channel' })
  channel!: SendChannel;

  @Column({ type: 'text' })
  recipient!: string;

  @Column({ type: 'enum', enum: TemplateKind, enumName: 'template_kind', name: 'template_kind' })
  templateKind!: TemplateKind;

  @Column({ type: 'text', name: 'rendered_subject', nullable: true })
  renderedSubject!: string | null;

  @Column({ type: 'text', name: 'rendered_body', nullable: true })
  renderedBody!: string | null;

  @Column({ type: 'enum', enum: SendStatus, enumName: 'send_status', default: SendStatus.Pending })
  status!: SendStatus;

  @Column({ type: 'int', default: 1 })
  attempt!: number;

  @Column({ type: 'text', name: 'provider_message_id', nullable: true })
  providerMessageId!: string | null;

  @Column({ type: 'text', name: 'failure_reason', nullable: true })
  failureReason!: string | null;

  /** `{campaignSendId|refundId|returnId|stockAlertId, ...}` — free-form since those tables don't live in this service's DB (ADR-2). */
  @Column({ type: 'text', name: 'ref_table', nullable: true })
  refTable!: string | null;

  @Column({ type: 'text', name: 'ref_id', nullable: true })
  refId!: string | null;

  @Index({ unique: true })
  @Column({ type: 'text', name: 'source_event_id' })
  sourceEventId!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
