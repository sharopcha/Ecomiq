/**
 * Topic-naming convention: one
 * partitioned topic per aggregate stream — not one topic per specific event
 * type — so `catalog.product.created/updated/archived` all land on the same
 * `product.events` topic and consumers filter by `envelope.eventType`. This
 * keeps topic count bounded (aggregates, not events) and preserves
 * per-aggregate ordering when combined with a Key_Shared subscription keyed
 * on `aggregateId`.
 */
export function topicForAggregate(
  tenant: string,
  namespace: string,
  aggregateType: string,
): string {
  return `persistent://${tenant}/${namespace}/${aggregateType}.events`;
}

/**
 * Command-topic naming convention:
 * a durable, retryable, decoupled request from one service to another that
 * expects a specific action to be taken — as opposed to a domain event
 * (`topicForAggregate`), which is a fact broadcast to whoever's listening.
 * One topic per *owning service* (not per aggregate) — e.g.
 * `topicForCommands('ecomiq', 'payments', 'payment')` ->
 * `persistent://ecomiq/payments/payment.commands`. Commands reuse
 * `EventEnvelope` on the wire (see `PulsarServerOptions.topics`'s doc
 * comment) — `eventType` doubles as the command type (e.g.
 * `payments.refund.execute`), dispatched via the same `@EventPattern`
 * mechanism a domain-event handler uses.
 */
export function topicForCommands(tenant: string, namespace: string, service: string): string {
  return `persistent://${tenant}/${namespace}/${service}.commands`;
}
