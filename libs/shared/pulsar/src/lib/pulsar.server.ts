import { CustomTransportStrategy, Server } from '@nestjs/microservices';
import type { Client, Consumer, Message } from 'pulsar-client';
import { decodeEnvelope } from './event-envelope';
import { topicForAggregate } from './topics';

export interface PulsarServerOptions {
  serviceUrl: string;
  tenant: string;
  namespace: string;
  /**
   * Aggregate streams to consume, e.g. ['product'] -> subscribes to
   * product.events. Ignored when `topics` is set.
   */
  aggregates: string[];
  /**
   * Explicit topic override for shapes `topicForAggregate` doesn't produce
   * (namely `<service>.commands`, via `topicForCommands` — this strategy
   * was built for `<aggregate>.events` topics and has no other way to
   * express a command-topic subscription). When set, subscribes to
   * exactly these topics instead of deriving them from `aggregates` (which
   * is then ignored, but still required by the type — pass `[]`).
   * Backwards-compatible: undefined (the default) is today's
   * aggregates-derived behavior, unchanged — same opt-in pattern as
   * `authToken`.
   */
  topics?: string[];
  /**
   * Consumer group name. Per-service (e.g. "inventory-service" consuming
   * catalog's product.events) so each service gets its own cursor —
   * "subscription per consumer-service" convention.
   */
  subscription: string;
  /** Shared = load-balance across instances; KeyShared = same + per-key ordering. Default 'Shared'. */
  subscriptionType?: 'Shared' | 'KeyShared' | 'Exclusive' | 'Failover';
  /** See PulsarModuleOptions.authToken's doc comment; identical undefined-means-unauthenticated default. */
  authToken?: string;
}

/**
 * Custom NestJS microservices transport strategy over `pulsar-client`.
 * Consumed the normal Nest way:
 *
 *   const app = await NestFactory.create(AppModule);
 *   app.connectMicroservice({ strategy: new PulsarServer({ ... }) });
 *   await app.startAllMicroservices();
 *
 * and handlers are declared with `@EventPattern('catalog.product.created')`
 * in any `@Controller()`. `envelope.eventType` is used as the pattern, so
 * one subscription can dispatch to many handlers by event type.
 *
 * Scope: **events only** (fire-and-forget), matching the architecture's
 * "domain events over Pulsar, sync request/reply over gRPC" split — this
 * strategy does not implement a reply-topic / RPC round trip.
 */
export class PulsarServer extends Server implements CustomTransportStrategy {
  private client?: Client;
  private consumer?: Consumer;

  constructor(private readonly options: PulsarServerOptions) {
    super();
  }

  async listen(callback: (...args: unknown[]) => void): Promise<void> {
    // Nest calls listen() exactly once per bootstrap (analogous to
    // httpServer.listen()) — this isn't on any hot path. The guard below is
    // just so a stray second call (a bug, or future reconnect-retry logic)
    // fails loudly instead of silently orphaning the first client/consumer.
    if (this.client) {
      callback(
        new Error('PulsarServer.listen() called more than once — call close() first.'),
      );
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client: PulsarClient, AuthenticationToken } = require('pulsar-client');
      this.client = new PulsarClient({
        serviceUrl: this.options.serviceUrl,
        ...(this.options.authToken
          ? { authentication: new AuthenticationToken({ token: this.options.authToken }) }
          : {}),
      });

      const topics =
        this.options.topics ??
        this.options.aggregates.map((aggregate) =>
          topicForAggregate(this.options.tenant, this.options.namespace, aggregate),
        );

      this.consumer = await this.client!.subscribe({
        topics,
        subscription: this.options.subscription,
        subscriptionType: this.options.subscriptionType ?? 'Shared',
        listener: (message, consumer) => {
          void this.handleMessage(message, consumer);
        },
      });

      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  async close(): Promise<void> {
    await this.consumer?.close().catch(() => undefined);
    await this.client?.close().catch(() => undefined);
  }

  /**
   * Required by `Server`'s abstract contract alongside `listen`/`close`.
   * NestJS's built-in strategies use `on()` to expose transport-specific
   * lifecycle events (e.g. Kafka rebalances) — there's nothing equivalent
   * to hook into for this poll/callback-based Pulsar consumer, so it's
   * intentionally a no-op rather than a fake event source.
   */
  on(): void {
    // no-op — see comment above
  }

  /** Escape hatch to the underlying `pulsar-client` Client, matching the `unwrap()` convention other Nest transporters use. */
  unwrap<T>(): T {
    return this.client as unknown as T;
  }

  private async handleMessage(message: Message, consumer: Consumer): Promise<void> {
    try {
      const envelope = decodeEnvelope(message.getData());
      const handler = this.getHandlerByPattern(envelope.eventType);

      if (!handler) {
        // No @EventPattern registered for this event type on this service —
        // ack anyway so it doesn't sit unacked/redelivered forever; this is
        // expected when a topic carries event types this consumer ignores.
        await consumer.acknowledge(message);
        return;
      }

      const result$ = this.transformToObservable(await handler(envelope.payload, envelope));
      result$.subscribe({
        next: () => undefined,
        error: async (err) => {
          this.logger.error(`handler for ${envelope.eventType} failed`, err);
          await consumer.negativeAcknowledge(message);
        },
        complete: async () => {
          await consumer.acknowledge(message);
        },
      });
    } catch (err) {
      this.logger.error('failed to decode/handle Pulsar message', err as Error);
      await consumer.negativeAcknowledge(message);
    }
  }
}
