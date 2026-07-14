import { OutboxMessage } from '@temp-nx/typeorm';
import { EntityManager } from 'typeorm';

export interface RecordOutboxEventInput {
  eventType: string;
  storeId: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  /** If set, this becomes a real Pulsar delayed message — see OutboxMessage.deliverAt's doc comment. Omit/null for the normal "relay ASAP" behavior. */
  deliverAt?: Date | null;
  /** Explicit topic override — see OutboxMessage.topic's doc comment. Omit/null for the normal "derive from this service's own namespace + aggregateType" behavior. */
  topic?: string | null;
}

/**
 * Inserts one `OutboxMessage` row via the given `EntityManager` — call this
 * with the *same* manager/transaction used to save the domain entity, e.g.:
 *
 *   await this.dataSource.transaction(async (manager) => {
 *     const product = await manager.save(Product, data);
 *     await recordOutboxEvent(manager, {
 *       eventType: 'catalog.product.created',
 *       storeId: product.storeId,
 *       aggregateType: 'product',
 *       aggregateId: product.id,
 *       payload: { id: product.id, name: product.name },
 *     });
 *     return product;
 *   });
 *
 * That's what makes it "transactional" outbox: if the transaction rolls
 * back, the outbox row never existed either — no dual-write gap between
 * "we changed the data" and "we told anyone about it."
 */
export async function recordOutboxEvent(
  manager: EntityManager,
  input: RecordOutboxEventInput,
): Promise<OutboxMessage> {
  const row = manager.create(OutboxMessage, {
    eventType: input.eventType,
    storeId: input.storeId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    payload: input.payload,
    deliverAt: input.deliverAt ?? null,
    processedAt: null,
    attempts: 0,
    lastError: null,
    topic: input.topic ?? null,
  });
  return manager.save(OutboxMessage, row);
}
