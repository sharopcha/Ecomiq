import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { InternalTokenClient } from '@temp-nx/auth';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { SendLog, SendStatus } from '../entities/send-log.entity';
import { EmailWebhookEvent } from '../channels/email-provider.port';

/**
 * Maps a normalized `EmailWebhookEvent` onto a `SendLog` state transition
 * plus a best-effort forward to marketing's engagement endpoint. No
 * separate `webhook_inbox` ledger (unlike payment's webhook path) —
 * redelivery is naturally idempotent here without one: re-flipping
 * `status` to `failed` on a row already `failed` is a harmless no-op, and
 * marketing's own `recordSendEvent` already guards its stats increment
 * against a duplicate `(sendId, kind)` (`alreadyRecorded` check), so a
 * repeated forward can't double-count either.
 */
@Injectable()
export class WebhookDispatchService {
  private readonly logger = new Logger(WebhookDispatchService.name);

  constructor(
    @InjectRepository(SendLog) private readonly sendLogRepo: Repository<SendLog>,
    private readonly tokenClient: InternalTokenClient,
    private readonly config: ConfigService,
  ) {}

  async handle(event: EmailWebhookEvent): Promise<void> {
    const row = await this.sendLogRepo.findOne({
      where: { providerMessageId: event.providerMessageId },
    });
    if (!row) {
      this.logger.warn(
        `webhook event for unknown providerMessageId=${event.providerMessageId} (kind=${event.kind}) — ignoring`,
      );
      return;
    }

    if (event.kind === 'bounced' && row.status !== SendStatus.Failed) {
      await this.sendLogRepo.manager.transaction(async (manager) => {
        row.status = SendStatus.Failed;
        row.failureReason = event.failureReason ?? 'provider reported bounce';
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
            failureReason: row.failureReason,
          },
        });
      });
    }

    if (
      row.refTable === 'campaign_send' &&
      (event.kind === 'opened' || event.kind === 'clicked' || event.kind === 'bounced')
    ) {
      await this.forwardToMarketing(row, event.kind);
    }
  }

  /**
   * Best-effort — a forwarding failure must not fail the webhook response
   * (the provider would retry-storm the whole webhook otherwise); marketing's
   * stats are eventually-consistent by design.
   */
  private async forwardToMarketing(
    row: SendLog,
    kind: 'opened' | 'clicked' | 'bounced',
  ): Promise<void> {
    // refId is the `${campaignId}:${sendId}` composite the Step 7 campaign
    // mapper stores — marketing's engagement route needs both ids.
    const [campaignId, sendId] = (row.refId ?? '').split(':');
    if (!campaignId || !sendId) {
      this.logger.warn(
        `send_log ${row.id} has refTable=campaign_send but an unparseable refId "${row.refId}" — skipping engagement forward`,
      );
      return;
    }

    try {
      const token = await this.tokenClient.getToken();
      const baseUrl = this.config
        .get<string>('MARKETING_SERVICE_URL', 'http://localhost:3006/api')
        .replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/campaigns/${campaignId}/sends/${sendId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId: row.storeId, kind }),
      });
      if (!response.ok) {
        this.logger.warn(
          `engagement forward to marketing failed: HTTP ${response.status} for send_log ${row.id}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `engagement forward to marketing failed for send_log ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
