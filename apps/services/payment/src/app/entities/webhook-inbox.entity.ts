import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';

/**
 * Webhook dedup ledger: every inbound `POST /api/payments/webhooks/:provider`
 * call, signature-verified before
 * insert, gets exactly one row keyed on `(provider, externalEventId)` —
 * providers retry webhook delivery as a matter of course, so this is what
 * makes a replayed delivery a no-op (200 early return, already processed)
 * instead of double-applying a state transition.
 *
 * Deliberately **not** a `TenantScopedEntity` — a webhook event doesn't
 * carry a `storeId` on the wire (the provider only knows its own intent/
 * event ids), and the row this event ultimately affects (`Payment`,
 * resolved by `externalRef` in `WebhookDispatchService`) is what's actually
 * store-scoped. `BaseEntity` (id + `@BeforeInsert` ULID) is enough here.
 */
@Entity('webhook_inbox')
@Index(['provider', 'externalEventId'], { unique: true })
export class WebhookInbox extends BaseEntity {
  @Column({ type: 'text' })
  provider!: string;

  /** The provider's own event id — combined with `provider` for the dedup key. */
  @Column({ type: 'text', name: 'external_event_id' })
  externalEventId!: string;

  @Column({ type: 'jsonb', name: 'payload_json' })
  payloadJson!: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'received_at', default: () => 'now()' })
  receivedAt!: Date;

  /** Null until `WebhookDispatchService` successfully applies the event's state transition. */
  @Column({ type: 'timestamptz', name: 'processed_at', nullable: true })
  processedAt?: Date | null;

  /** Set (row stays, for replay/inspection) if dispatch threw instead of succeeding. */
  @Column({ type: 'text', name: 'processing_error', nullable: true })
  processingError?: string | null;
}
