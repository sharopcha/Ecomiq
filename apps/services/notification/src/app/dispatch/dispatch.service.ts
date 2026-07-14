import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { SendLog, SendChannel, SendStatus } from '../entities/send-log.entity';
import { TemplateKind } from '../entities/email-template.entity';
import { TemplatesService } from '../templates/templates.service';
import { renderTemplate } from '../templates/render-template.util';
import { EmailProviderPort } from '../channels/email-provider.port';
import { SmsProviderPort } from '../channels/sms-provider.port';
import { WhatsAppProviderPort } from '../channels/whatsapp-provider.port';
import { InAppChannel } from '../channels/in-app.channel';
import { ChannelSendResult } from '../channels/channel-provider.types';
import { backoffMs } from './backoff.util';

export interface DispatchInput {
  storeId: string;
  channel: SendChannel;
  /** Email address / phone number for email|sms|whatsapp; the literal `'broadcast'` convention for in_app (this plan never targets a specific user in-app — see InAppChannel's doc comment). */
  recipient: string;
  templateKind: TemplateKind;
  vars: Record<string, string>;
  /** The idempotency key — a redelivered command/event maps to the same `send_log` row via this column. */
  sourceEventId: string;
  refTable?: string | null;
  refId?: string | null;
  /**
   * Replace the resolved template's rendered subject/body verbatim, for
   * callers that already have final content rather than vars for a store
   * template — e.g. order's refund settlement passing a merchant-authored
   * `messageToCustomer` as `bodyOverride`, or a synthesized staff alert
   * (Step 7's `refund_failed_staff_alert` mapping) that has no matching
   * `template_kind` to render against at all. Applied once at first
   * dispatch and baked into the `send_log` row's stored rendered
   * subject/body — retries reuse the stored value, no override handling
   * needed in `redispatch()`.
   */
  subjectOverride?: string;
  bodyOverride?: string;
}

/**
 * The single entry every consumer (Steps 7/9/10) and the retry controller
 * both call. `dispatch()` handles first-time processing (resolves the
 * template, renders it, creates the `send_log` row); `redispatch()` handles
 * a retry re-attempt on an existing row using its already-rendered
 * subject/body — no need to re-resolve/re-render on every retry.
 *
 * Every status/attempt mutation and its corresponding outbox event commit
 * in one transaction — "never publish outside the outbox" (repo rule). The
 * actual channel-adapter network call happens *outside* any transaction
 * (never hold a DB transaction open across an external call).
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    @InjectRepository(SendLog) private readonly sendLogRepo: Repository<SendLog>,
    private readonly templates: TemplatesService,
    private readonly emailProvider: EmailProviderPort,
    private readonly smsProvider: SmsProviderPort,
    private readonly whatsAppProvider: WhatsAppProviderPort,
    private readonly inAppChannel: InAppChannel,
    private readonly config: ConfigService,
  ) {}

  async dispatch(input: DispatchInput): Promise<SendLog> {
    const existing = await this.sendLogRepo.findOne({
      where: { sourceEventId: input.sourceEventId },
    });
    if (existing) {
      if (existing.status === SendStatus.Sent || existing.status === SendStatus.Dead) {
        // Terminal — a redelivered command/event is a no-op, not a re-send.
        return existing;
      }
      return this.attempt(existing);
    }

    const resolved = await this.templates.resolveTemplate(input.storeId, input.templateKind);
    const rendered = renderTemplate(resolved, input.vars);
    if (rendered.missing.length > 0) {
      this.logger.warn(
        `template variables missing for sourceEventId=${input.sourceEventId} kind=${input.templateKind}: ${rendered.missing.join(', ')}`,
      );
    }
    const finalSubject = input.subjectOverride ?? rendered.subject;
    const finalBody = input.bodyOverride ?? rendered.body;

    const row = await this.sendLogRepo.manager.transaction(async (manager) => {
      const entity = manager.create(SendLog, {
        storeId: input.storeId,
        channel: input.channel,
        recipient: input.recipient,
        templateKind: input.templateKind,
        renderedSubject: finalSubject,
        renderedBody: finalBody,
        status: SendStatus.Pending,
        attempt: 1,
        sourceEventId: input.sourceEventId,
        refTable: input.refTable ?? null,
        refId: input.refId ?? null,
      });
      return manager.save(SendLog, entity);
    });

    return this.attempt(row);
  }

  /**
   * Called by `MessageRetryController` when a delayed `notify.message.retry`
   * self-message finally arrives. Reloads the row fresh (never trusts a
   * stale in-memory copy) — same reservation-expiry precedent as
   * inventory's `ReservationsService.expire()`. Returns `null` only in the
   * practically-impossible case the row itself vanished; the caller treats
   * that as a silent no-op too, never crashes the consumer.
   */
  async redispatch(sendLogId: string): Promise<SendLog | null> {
    const row = await this.sendLogRepo.findOne({ where: { id: sendLogId } });
    if (!row) {
      this.logger.warn(`notify.message.retry arrived for a send_log row that no longer exists: ${sendLogId}`);
      return null;
    }
    if (row.status === SendStatus.Sent || row.status === SendStatus.Dead) {
      // Already resolved by the time the delayed message arrived — no-op.
      return row;
    }
    return this.attempt(row);
  }

  private async attempt(row: SendLog): Promise<SendLog> {
    const result = await this.sendViaChannel(row);
    const maxAttempts = this.config.get<number>('NOTIFICATION_MAX_ATTEMPTS', 5);

    // Narrow with `=== true`/`=== false` explicitly, extracting every field
    // from `result` in the same guarded block — repo rule: `tsconfig.base.json`
    // doesn't set `strictNullChecks`, so relying on control-flow narrowing
    // across an early return does not reliably narrow the union.
    if (result.ok === true) {
      const providerMessageId = result.providerMessageId;
      return this.sendLogRepo.manager.transaction(async (manager) => {
        row.status = SendStatus.Sent;
        row.providerMessageId = providerMessageId;
        row.failureReason = null;
        await manager.save(SendLog, row);
        await recordOutboxEvent(manager, {
          eventType: 'notify.message.sent',
          storeId: row.storeId,
          aggregateType: 'message',
          aggregateId: row.id,
          payload: { sendLogId: row.id, channel: row.channel, recipient: row.recipient },
        });
        return row;
      });
    }

    const failureMessage = result.message;

    if (row.attempt < maxAttempts) {
      return this.sendLogRepo.manager.transaction(async (manager) => {
        row.attempt += 1;
        row.failureReason = failureMessage;
        await manager.save(SendLog, row);

        const baseMs = this.config.get<number>('NOTIFICATION_RETRY_BASE_MS', 60_000);
        const maxMs = this.config.get<number>('NOTIFICATION_RETRY_MAX_MS', 30 * 60_000);
        const delayMs = backoffMs(row.attempt, baseMs, maxMs);

        await recordOutboxEvent(manager, {
          eventType: 'notify.message.retry',
          storeId: row.storeId,
          aggregateType: 'message',
          aggregateId: row.id,
          payload: { sendLogId: row.id },
          deliverAt: new Date(Date.now() + delayMs),
        });
        return row;
      });
    }

    return this.sendLogRepo.manager.transaction(async (manager) => {
      row.status = SendStatus.Dead;
      row.failureReason = failureMessage;
      await manager.save(SendLog, row);
      await recordOutboxEvent(manager, {
        eventType: 'notify.message.failed',
        storeId: row.storeId,
        aggregateType: 'message',
        aggregateId: row.id,
        payload: {
          sendLogId: row.id,
          channel: row.channel,
          recipient: row.recipient,
          failureReason: failureMessage,
        },
      });
      return row;
    });
  }

  private async sendViaChannel(row: SendLog): Promise<ChannelSendResult> {
    switch (row.channel) {
      case SendChannel.Email:
        return this.emailProvider.send({
          to: row.recipient,
          subject: row.renderedSubject ?? '',
          body: row.renderedBody ?? '',
        });
      case SendChannel.Sms:
        return this.smsProvider.send({ to: row.recipient, body: row.renderedBody ?? '' });
      case SendChannel.WhatsApp:
        return this.whatsAppProvider.send({ to: row.recipient, body: row.renderedBody ?? '' });
      case SendChannel.InApp: {
        // Every in-app dispatch across this plan (Steps 7/9) is a
        // store-wide broadcast — nothing here ever targets one specific
        // user (see InAppChannel's doc comment for why in-app has no port).
        const pushed = await this.inAppChannel.send(row.storeId, {
          userId: null,
          kind: row.templateKind,
          title: row.renderedSubject,
          body: row.renderedBody,
          refTable: row.refTable,
          refId: row.refId,
        });
        return { ok: true, providerMessageId: pushed.notificationId };
      }
    }
  }
}
