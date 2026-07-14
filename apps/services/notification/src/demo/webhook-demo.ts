/**
 * Runnable proof — boots the real Nest application context (real
 * `WebhookDispatchService`, real Postgres) and exercises the full webhook
 * flow: HMAC signature verification + parsing (the same code path
 * `WebhooksController` calls), a `bounced` event flipping `send_log.status`
 * to `failed` with a `notify.message.failed` outbox row, a best-effort
 * (never-throws) engagement forward attempt for a `campaign_send`-linked
 * row, and a silent no-op for an unrecognized `providerMessageId`.
 *
 * Run:
 *   npm run notification:webhook-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { WebhookDispatchService } from '../app/webhooks/webhook-dispatch.service';
import { EmailProviderPort } from '../app/channels/email-provider.port';
import { signMockEmailWebhookBody, MOCK_EMAIL_SIGNATURE_HEADER } from '../app/channels/mock-email.provider';
import { SendLog, SendChannel, SendStatus } from '../app/entities/send-log.entity';
import { TemplateKind } from '../app/entities/email-template.entity';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[webhook-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const sendLogRepo = app.get<Repository<SendLog>>(getRepositoryToken(SendLog));
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));
  const dispatch = app.get(WebhookDispatchService);
  const emailProvider = app.get(EmailProviderPort);
  const webhookSecret = process.env.NOTIFICATION_WEBHOOK_SECRET ?? 'dev-mock-webhook-secret';

  console.log('[webhook-demo] verifying the signature path end-to-end (sign, then verify+parse)...');
  const bouncedRow = await sendLogRepo.save(
    sendLogRepo.create({
      storeId,
      channel: SendChannel.Email,
      recipient: 'ada@example.com',
      templateKind: TemplateKind.Refund,
      renderedSubject: 'A refund was issued',
      renderedBody: 'Body',
      status: SendStatus.Sent,
      attempt: 1,
      providerMessageId: `mock_email_${ulid()}`,
      sourceEventId: `demo-webhook-bounce-${ulid()}`,
    }),
  );
  const bounceBody = Buffer.from(
    JSON.stringify({
      externalEventId: `evt_${ulid()}`,
      kind: 'bounced',
      providerMessageId: bouncedRow.providerMessageId,
      failureReason: 'mailbox does not exist',
    }),
  );
  const signature = signMockEmailWebhookBody(bounceBody, webhookSecret);
  const verify = emailProvider.verifyWebhookSignature(bounceBody, { [MOCK_EMAIL_SIGNATURE_HEADER]: signature });
  assert(verify.ok === true, 'a correctly signed body should verify');
  const badVerify = emailProvider.verifyWebhookSignature(bounceBody, { [MOCK_EMAIL_SIGNATURE_HEADER]: 'not-a-real-signature' });
  assert(badVerify.ok === false, 'a bad signature should fail verification');
  console.log('[webhook-demo] OK — signature verification works both ways.');

  console.log('[webhook-demo] bounced event flips send_log.status to failed + emits notify.message.failed...');
  const bounceEvent = emailProvider.parseWebhookEvent(bounceBody);
  await dispatch.handle(bounceEvent);
  const afterBounce = await sendLogRepo.findOneOrFail({ where: { id: bouncedRow.id } });
  assert(afterBounce.status === SendStatus.Failed, `expected status failed, got ${afterBounce.status}`);
  assert(afterBounce.failureReason === 'mailbox does not exist', 'failureReason should carry the provider-reported reason');
  const failedEvents = await outboxRepo.count({
    where: { aggregateId: bouncedRow.id, eventType: 'notify.message.failed' },
  });
  assert(failedEvents === 1, `expected exactly 1 notify.message.failed outbox row, got ${failedEvents}`);
  console.log('[webhook-demo] OK — bounced handled, idempotent to re-apply too (checking now)...');
  await dispatch.handle(bounceEvent);
  const afterSecondBounce = await sendLogRepo.findOneOrFail({ where: { id: bouncedRow.id } });
  assert(afterSecondBounce.status === SendStatus.Failed, 'status should remain failed on a repeated bounce event');
  const failedEventsAfterReplay = await outboxRepo.count({
    where: { aggregateId: bouncedRow.id, eventType: 'notify.message.failed' },
  });
  assert(
    failedEventsAfterReplay === 1,
    `a repeated bounced event must not emit a second notify.message.failed row, got ${failedEventsAfterReplay}`,
  );
  console.log('[webhook-demo] OK — replay is a no-op, no duplicate outbox row.');

  console.log('[webhook-demo] opened event for a campaign_send-linked row attempts a best-effort forward, never throws...');
  const campaignRow = await sendLogRepo.save(
    sendLogRepo.create({
      storeId,
      channel: SendChannel.Email,
      recipient: 'ada@example.com',
      templateKind: TemplateKind.Campaign,
      renderedSubject: 'A campaign email',
      renderedBody: 'Body',
      status: SendStatus.Sent,
      attempt: 1,
      providerMessageId: `mock_email_${ulid()}`,
      sourceEventId: `demo-webhook-opened-${ulid()}`,
      refTable: 'campaign_send',
      refId: `demo-campaign-1:demo-send-1`,
    }),
  );
  const openedEvent = {
    externalEventId: `evt_${ulid()}`,
    kind: 'opened' as const,
    providerMessageId: campaignRow.providerMessageId as string,
  };
  await dispatch.handle(openedEvent); // must not throw even though marketing-service likely isn't reachable
  console.log('[webhook-demo] OK — forward attempted, handle() resolved without throwing (best-effort, per the plan).');

  console.log('[webhook-demo] an event for an unknown providerMessageId is a silent no-op...');
  await dispatch.handle({
    externalEventId: `evt_${ulid()}`,
    kind: 'delivered' as const,
    providerMessageId: `unknown_${ulid()}`,
  });
  console.log('[webhook-demo] OK — unknown providerMessageId ignored without throwing.');

  console.log('[webhook-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[webhook-demo] FAILED:', err);
  process.exit(1);
});
