import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * Transactional outbox row — "transactional outbox everywhere". A domain
 * transaction inserts one of
 * these in the *same* TypeORM transaction as the entity change it
 * describes; the relay in libs/shared/pulsar polls
 * `processed_at IS NULL` rows, publishes them to Pulsar, and marks them
 * processed. No dual-write bugs: either both the domain row and the outbox
 * row commit, or neither does.
 *
 * Each service registers this entity against its *own* table in its *own*
 * database (ADR-2, DB-per-service) — e.g. catalog-service's `outbox` table
 * is entirely separate from any other service's.
 */
@Entity({ name: 'outbox' })
@Index(['processedAt', 'createdAt'])
export class OutboxMessage extends BaseEntity {
  /** e.g. "catalog.product.created" — matches the eventual Pulsar topic/event name. */
  @Column({ type: 'text', name: 'event_type' })
  eventType!: string;

  /** Domain aggregate this event describes, e.g. "product" or "product_variant". */
  @Column({ type: 'text', name: 'aggregate_type' })
  aggregateType!: string;

  /** id of the aggregate row (product.id, product_variant.id, ...). */
  @Column({ type: 'text', name: 'aggregate_id' })
  aggregateId!: string;

  /** Tenant the event belongs to, so the relay/consumers can filter per store. */
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  /** Event body. jsonb so Postgres can index/query into it if that's ever needed. */
  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;

  /**
   * A real Pulsar delayed message (`ProducerMessage.deliverAt`), not a relay
   * scheduling delay — the relay still picks this row up and calls
   * `producer.send()` on its normal poll cadence (see OutboxRelayService),
   * it's the Pulsar *broker* that holds the message invisible to consumers
   * until this instant. Null (the common case) means "relay it as soon as
   * you see it," unchanged from before this column existed. Added for
   * inventory-service's 24h reservation auto-expiry but generic —
   * any service can use it for any future delayed-message need.
   */
  @Column({ type: 'timestamptz', name: 'deliver_at', nullable: true })
  deliverAt!: Date | null;

  /** Set by the relay once Pulsar has acked the publish. Null = still pending. */
  @Column({ type: 'timestamptz', name: 'processed_at', nullable: true })
  processedAt!: Date | null;

  @Column({ type: 'int', name: 'attempts', default: 0 })
  attempts!: number;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError!: string | null;

  /**
   * Explicit topic override — null (the default, unchanged behavior) means
   * `PulsarProducerService.publish()` derives the topic from
   * `(tenant, this service's own namespace, aggregateType)`, exactly as
   * before this column existed. Set this when an outbox row must land on a
   * *different* namespace/topic-shape than that — the one case so far is
   * order-service approving a refund
   * publishes a `payments.refund.execute` command onto payment-service's
   * own `payments/payment.commands` topic (`topicForCommands`), not
   * anywhere in order-service's own `orders` namespace. Backwards-compatible
   * lib extension, same pattern as `PulsarServerOptions.topics`.
   */
  @Column({ type: 'text', nullable: true })
  topic!: string | null;
}
