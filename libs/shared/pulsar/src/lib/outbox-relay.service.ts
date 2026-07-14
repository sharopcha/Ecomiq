import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OutboxMessage } from '@temp-nx/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createEnvelope } from './event-envelope';
import { PulsarProducerService } from './pulsar-producer.service';
import { PULSAR_MODULE_OPTIONS, PulsarModuleOptions } from './pulsar.module-options';

/**
 * The relay half of the transactional outbox pattern. Domain code writes
 * an `OutboxMessage`
 * row in the *same* DB transaction as the entity change it describes; this
 * service polls for unpublished rows (`processed_at IS NULL`), publishes
 * each to Pulsar via `PulsarProducerService`, and marks it processed. If
 * Pulsar publish fails, the row is left unprocessed with `attempts`/
 * `last_error` updated for the next tick to retry — at-least-once delivery,
 * so consumers must be idempotent (per the architecture's "consumer
 * idempotency everywhere" resilience note).
 *
 * Implemented as a plain `setInterval` poll rather than pulling in
 * `@nestjs/schedule` — one dependency avoided for something this simple, and
 * it's the kind of thing that's easy to swap for a smarter mechanism
 * (LISTEN/NOTIFY, a queue) later without any caller-facing change.
 */
@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;

  constructor(
    @InjectRepository(OutboxMessage) private readonly outboxRepo: Repository<OutboxMessage>,
    private readonly producer: PulsarProducerService,
    @Inject(PULSAR_MODULE_OPTIONS) private readonly options: PulsarModuleOptions,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.options.relayIntervalMs ?? 1000;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.logger.log(`outbox relay polling every ${intervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.ticking) return; // don't overlap a slow tick with the next timer fire
    this.ticking = true;
    try {
      const batchSize = this.options.relayBatchSize ?? 20;
      const rows = await this.outboxRepo.find({
        where: { processedAt: IsNull() },
        order: { createdAt: 'ASC' },
        take: batchSize,
      });

      for (const row of rows) {
        await this.publishRow(row);
      }
    } catch (err) {
      this.logger.error('outbox relay tick failed', err as Error);
    } finally {
      this.ticking = false;
    }
  }

  private async publishRow(row: OutboxMessage): Promise<void> {
    try {
      const envelope = createEnvelope({
        eventId: row.id,
        eventType: row.eventType,
        storeId: row.storeId,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        payload: row.payload,
        occurredAt: row.createdAt,
      });

      await this.producer.publish(envelope, {
        ...(row.deliverAt ? { deliverAt: row.deliverAt } : {}),
        ...(row.topic ? { topic: row.topic } : {}),
      });

      row.processedAt = new Date();
      await this.outboxRepo.save(row);
    } catch (err) {
      row.attempts += 1;
      row.lastError = err instanceof Error ? err.message : String(err);
      await this.outboxRepo.save(row);
      this.logger.warn(
        `failed to publish outbox row ${row.id} (${row.eventType}), attempt ${row.attempts}`,
        err as Error,
      );
    }
  }
}
