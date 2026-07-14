import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { WebhookInbox } from '../entities/webhook-inbox.entity';
import { ProviderWebhookEvent } from '../provider/payment-provider.port';
import { PAYMENT_AGGREGATE_TYPE, PaymentEventType } from '../events/payment-event-types';
import { RefundsService } from '../refunds/refunds.service';

const UNIQUE_VIOLATION = '23505';

/**
 * Maps a normalized `ProviderWebhookEvent` onto a `Payment` state
 * transition + outbox write, with `WebhookInbox` as the replay-safe
 * dedup/retry ledger.
 *
 * `claimInboxRow()` distinguishes two shapes of "this event already has a
 * row": already **successfully** processed (`processedAt` set — a true
 * duplicate delivery, safe no-op) vs. previously **attempted and failed**
 * (`processedAt` still null, `processingError` set from a prior run) — the
 * second case must retry using the *same* row, not silently swallow the
 * event, or a webhook that errored once would never get applied even
 * though the provider keeps retrying it (the row's unique
 * `(provider, external_event_id)` index would otherwise make every retry
 * look like "already processed"). This is why `webhook_inbox` rows are
 * never deleted after a failure — "stays for replay" per the entity's doc
 * comment.
 *
 * Each transition is itself idempotent against the *domain* state (checks
 * `payment.status` before applying) as a second layer of safety — e.g. a
 * `refund.*` webhook arriving after the same settlement already landed via
 * a different externalEventId (in principle shouldn't happen, but cheap to
 * guard).
 */
@Injectable()
export class WebhookDispatchService {
  private readonly logger = new Logger(WebhookDispatchService.name);

  constructor(
    @InjectRepository(WebhookInbox) private readonly inboxRepo: Repository<WebhookInbox>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    private readonly refunds: RefundsService,
  ) {}

  async handle(
    provider: string,
    rawBody: Buffer,
    event: ProviderWebhookEvent,
  ): Promise<{ status: 'processed' | 'already_processed' }> {
    const inboxRow = await this.claimInboxRow(provider, event, rawBody);
    if (inboxRow === null) {
      return { status: 'already_processed' };
    }

    try {
      await this.applyTransition(event);
      inboxRow.processedAt = new Date();
      inboxRow.processingError = null;
      await this.inboxRepo.save(inboxRow);
      return { status: 'processed' };
    } catch (err) {
      inboxRow.processingError = err instanceof Error ? err.message : String(err);
      await this.inboxRepo.save(inboxRow);
      this.logger.error(
        `Webhook dispatch failed for ${provider}/${event.externalEventId}: ${inboxRow.processingError}`,
      );
      throw err;
    }
  }

  /** Returns the WebhookInbox row to (re)process, or null if this exact event already processed successfully. */
  private async claimInboxRow(
    provider: string,
    event: ProviderWebhookEvent,
    rawBody: Buffer,
  ): Promise<WebhookInbox | null> {
    try {
      const row = this.inboxRepo.create({
        provider,
        externalEventId: event.externalEventId,
        payloadJson: JSON.parse(rawBody.toString('utf8')),
        receivedAt: new Date(),
        processedAt: null,
        processingError: null,
      });
      return await this.inboxRepo.save(row);
    } catch (err) {
      if (!this.isUniqueViolation(err)) throw err;

      const existing = await this.inboxRepo.findOneBy({
        provider,
        externalEventId: event.externalEventId,
      });
      if (!existing) throw err; // lost the race but the winner's row is somehow gone — surface the original error
      if (existing.processedAt) return null;
      return existing;
    }
  }

  private async applyTransition(event: ProviderWebhookEvent): Promise<void> {
    switch (event.kind) {
      case 'intent.succeeded':
        return this.applyIntentSucceeded(event);
      case 'intent.failed':
        return this.applyIntentFailed(event);
      case 'refund.succeeded':
        // Async-provider settlement path — keyed by the provider's
        // own refund reference (`event.externalRef` here means the refund's
        // ref, not the payment intent's — see RefundsService.settleRefundByProviderRef's
        // doc comment). Unreachable through the mock provider today (its
        // executeRefund always resolves synchronously), but must exist and
        // be correct for a future async provider's webhook confirmation.
        return this.refunds.settleRefundByProviderRef(event.externalRef, 'succeeded');
      case 'refund.failed':
        return this.refunds.settleRefundByProviderRef(
          event.externalRef,
          'failed',
          event.failureReason,
        );
      default:
        throw new Error(`Unknown webhook event kind: ${(event as ProviderWebhookEvent).kind}`);
    }
  }

  private async applyIntentSucceeded(event: ProviderWebhookEvent): Promise<void> {
    await this.paymentRepo.manager.transaction(async (manager) => {
      const payment = await manager
        .createQueryBuilder(Payment, 'p')
        .setLock('pessimistic_write', undefined, ['p'])
        .where('p.external_ref = :ref', { ref: event.externalRef })
        .getOne();

      if (!payment) {
        throw new NotFoundException(`No payment found for externalRef ${event.externalRef}`);
      }
      if (payment.status === PaymentStatus.Paid) return; // already applied — idempotent no-op

      payment.status = PaymentStatus.Paid;
      await manager.save(payment);

      await recordOutboxEvent(manager, {
        eventType: PaymentEventType.PaymentSucceeded,
        storeId: payment.storeId,
        aggregateType: PAYMENT_AGGREGATE_TYPE,
        aggregateId: payment.id,
        payload: {
          paymentId: payment.id,
          orderId: payment.orderId,
          storeId: payment.storeId,
          amountMinor: payment.amountMinor,
          methodBrand: payment.methodBrand,
          methodLast4: payment.methodLast4,
        },
      });
    });
  }

  private async applyIntentFailed(event: ProviderWebhookEvent): Promise<void> {
    await this.paymentRepo.manager.transaction(async (manager) => {
      const payment = await manager
        .createQueryBuilder(Payment, 'p')
        .setLock('pessimistic_write', undefined, ['p'])
        .where('p.external_ref = :ref', { ref: event.externalRef })
        .getOne();

      if (!payment) {
        throw new NotFoundException(`No payment found for externalRef ${event.externalRef}`);
      }
      if (payment.status === PaymentStatus.Failed) return; // already applied — idempotent no-op

      payment.status = PaymentStatus.Failed;
      await manager.save(payment);

      await recordOutboxEvent(manager, {
        eventType: PaymentEventType.PaymentFailed,
        storeId: payment.storeId,
        aggregateType: PAYMENT_AGGREGATE_TYPE,
        aggregateId: payment.id,
        payload: {
          paymentId: payment.id,
          orderId: payment.orderId,
          storeId: payment.storeId,
          amountMinor: payment.amountMinor,
          failureReason: event.failureReason,
        },
      });
    });
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
    );
  }
}
