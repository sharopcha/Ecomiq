import { ulid } from 'ulid';

/**
 * Wire format for every domain event published to Pulsar — one shape shared
 * by every service, so any consumer can deserialize any producer's message
 * without per-producer knowledge. Mirrors (but is distinct from) the
 * `OutboxMessage` DB row in `@temp-nx/typeorm`: the outbox row is "what we
 * still owe Pulsar," the envelope is "what we actually put on the wire."
 */
export interface EventEnvelope<T = unknown> {
  /** ULID — also the id of the `outbox` row this event was relayed from. */
  eventId: string;
  /** e.g. "catalog.product.created" — dot-namespaced service.aggregate.verb. */
  eventType: string;
  /** Bumped when payload shape changes incompatibly (ADR: "contract drift" mitigation). */
  eventVersion: number;
  /** ISO-8601 timestamp of when the domain change happened (not when it was published). */
  occurredAt: string;
  /** Tenant (store.id) this event belongs to. */
  storeId: string;
  /** Domain aggregate the event is about, e.g. "product". */
  aggregateType: string;
  /** id of that aggregate row. */
  aggregateId: string;
  /** Propagated for cross-service tracing/observability. */
  correlationId?: string;
  payload: T;
}

export interface CreateEnvelopeInput<T> {
  eventType: string;
  storeId: string;
  aggregateType: string;
  aggregateId: string;
  payload: T;
  eventVersion?: number;
  occurredAt?: Date;
  correlationId?: string;
  /** Reuse an existing id (e.g. the outbox row's id) instead of minting a new one. */
  eventId?: string;
}

export function createEnvelope<T>(input: CreateEnvelopeInput<T>): EventEnvelope<T> {
  return {
    eventId: input.eventId ?? ulid(),
    eventType: input.eventType,
    eventVersion: input.eventVersion ?? 1,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    storeId: input.storeId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    correlationId: input.correlationId,
    payload: input.payload,
  };
}

export function encodeEnvelope(envelope: EventEnvelope): Buffer {
  return Buffer.from(JSON.stringify(envelope), 'utf8');
}

export function decodeEnvelope<T = unknown>(data: Buffer): EventEnvelope<T> {
  return JSON.parse(data.toString('utf8')) as EventEnvelope<T>;
}
