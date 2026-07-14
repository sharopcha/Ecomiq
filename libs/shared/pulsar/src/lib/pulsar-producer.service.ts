import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Client, Producer } from 'pulsar-client';
import { EventEnvelope, encodeEnvelope } from './event-envelope';
import { PULSAR_MODULE_OPTIONS, PulsarModuleOptions } from './pulsar.module-options';
import { topicForAggregate } from './topics';

/**
 * Thin wrapper around a `pulsar-client` `Client` that lazily opens one
 * `Producer` per aggregate-stream topic and reuses it (opening a producer
 * per publish would be needlessly slow — Pulsar producers are meant to be
 * long-lived). Used directly by domain code that wants to publish
 * synchronously, and by `OutboxRelayService` for the normal outbox-relay path.
 */
@Injectable()
export class PulsarProducerService implements OnModuleDestroy {
  private readonly logger = new Logger(PulsarProducerService.name);
  private client?: Client;
  private readonly producers = new Map<string, Producer>();

  constructor(
    @Inject(PULSAR_MODULE_OPTIONS) private readonly options: PulsarModuleOptions,
  ) {}

  private async getClient(): Promise<Client> {
    let client = this.client;
    if (!client) {
      // Deferred require so services that only *consume* (via PulsarServer)
      // and never publish don't need pulsar-client resolvable either —
      // and so this module can be imported without pulsar-client installed
      // until a service actually calls publish()/starts the relay.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client: PulsarClient, AuthenticationToken } = require('pulsar-client');
      client = new PulsarClient({
        serviceUrl: this.options.serviceUrl,
        // See PulsarModuleOptions.authToken's doc comment for the
        // undefined-means-unauthenticated dev default.
        ...(this.options.authToken
          ? { authentication: new AuthenticationToken({ token: this.options.authToken }) }
          : {}),
      }) as Client;
      this.client = client;
    }
    return client;
  }

  private async getProducer(topic: string): Promise<Producer> {
    const existing = this.producers.get(topic);
    if (existing) return existing;

    const client = await this.getClient();
    const producer = await client.createProducer({ topic });
    this.producers.set(topic, producer);
    return producer;
  }

  /**
   * Publish one envelope to its aggregate's topic, keyed by aggregateId for
   * per-aggregate ordering. `options.deliverAt`, when given, is forwarded as
   * `pulsar-client`'s `ProducerMessage.deliverAt` (epoch ms) — a *real*
   * Pulsar delayed message: the broker holds it invisible to every consumer
   * until that instant, not a delay on this call itself (`send()` still
   * returns as soon as the broker acks receipt). Used by OutboxRelayService
   * for any outbox row with a non-null `deliverAt` (see OutboxMessage's doc
   * comment) — inventory-service's reservation auto-expiry is the
   * first caller of this.
   *
   * `options.topic`, when given, is used verbatim instead of the derived
   * `(tenant, this service's own namespace, aggregateType)` topic — see
   * `OutboxMessage.topic`'s doc comment (e.g. a refund-execute command
   * targeting payment-service's own command topic).
   */
  async publish(envelope: EventEnvelope, options?: { deliverAt?: Date; topic?: string }): Promise<void> {
    const topic =
      options?.topic ??
      topicForAggregate(this.options.tenant, this.options.namespace, envelope.aggregateType);
    const producer = await this.getProducer(topic);
    await producer.send({
      data: encodeEnvelope(envelope),
      partitionKey: envelope.aggregateId,
      ...(options?.deliverAt ? { deliverAt: options.deliverAt.getTime() } : {}),
    });
    this.logger.debug(
      `published ${envelope.eventType} (${envelope.eventId}) -> ${topic}` +
        (options?.deliverAt ? ` (deliverAt ${options.deliverAt.toISOString()})` : ''),
    );
  }

  async onModuleDestroy(): Promise<void> {
    for (const producer of this.producers.values()) {
      await producer.close().catch(() => undefined);
    }
    await this.client?.close().catch(() => undefined);
  }
}
