/**
 * Demo seed data for notification-service: 2 email templates (one per
 * interesting kind — `refund` and `campaign`, the two kinds live producers
 * actually exercise today per Step 7), 3 in-app notifications (1 store-wide
 * broadcast + 2 targeted at two different demo users, one of the three
 * marked read), and 4 `send_log` rows covering every status
 * (`sent`/`failed`/`dead`/`pending`). Mirrors catalog/marketing's
 * `src/demo/seed.ts` conventions (boots the real Nest app context,
 * `--store=` arg, cheap-to-create-so-a-rerun-just-adds-a-fresh-set policy).
 *
 * `send_log` rows are seeded directly via the repository, not through
 * `DispatchService` — there's no real channel-adapter send behind a seed
 * script's synthetic history, same reasoning as marketing's seed setting
 * an `expired` discount directly for the one status nothing in the real
 * service naturally reaches.
 *
 *   docker compose up -d postgres
 *   npm run notification:seed
 *   npm run notification:seed -- --store=my-demo-store   # pin a specific storeId
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { TemplatesService } from '../app/templates/templates.service';
import { NotificationsService } from '../app/notifications/notifications.service';
import { TemplateKind } from '../app/entities/email-template.entity';
import { SendLog, SendChannel, SendStatus } from '../app/entities/send-log.entity';

function storeIdFromArgs(): string {
  const arg = process.argv.find((a) => a.startsWith('--store='));
  return arg ? arg.slice('--store='.length) : 'demo-store';
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = storeIdFromArgs();
  console.log(`[seed] seeding notification demo data for storeId=${storeId}`);

  const templates = app.get(TemplatesService);
  const notifications = app.get(NotificationsService);
  const sendLogRepo = app.get<Repository<SendLog>>(getRepositoryToken(SendLog));

  console.log('[seed] email templates (refund, campaign)...');
  const refundTemplate = await templates.create(storeId, {
    kind: TemplateKind.Refund,
    name: 'Refund issued',
    subject: 'A refund was issued for order {{Order_ID}}',
    body: 'Hi {{Customer_name}},\n\nA refund has been issued for your order {{Order_ID}} from {{Store_name}}.',
  });
  const campaignTemplate = await templates.create(storeId, {
    kind: TemplateKind.Campaign,
    name: 'Seasonal sale announcement',
    subject: '{{Store_name}} has a sale on right now',
    body: 'Hi {{Customer_name}},\n\nDon\'t miss our latest sale at {{Store_name}}.',
    isAiRecommended: true,
  });

  console.log('[seed] in-app notifications (1 broadcast + 2 targeted, one read)...');
  const userA = `demo-user-a-${storeId}`;
  const userB = `demo-user-b-${storeId}`;
  const broadcast = await notifications.push(storeId, {
    kind: 'stock_low',
    title: 'Low stock',
    body: 'A SKU is running low — check the Inventory list.',
  });
  const targetedA = await notifications.push(storeId, {
    userId: userA,
    kind: 'refund_failed_staff_alert',
    title: 'Refund failed',
    body: 'A refund attempt failed and needs attention.',
  });
  const targetedBRead = await notifications.push(storeId, {
    userId: userB,
    kind: 'return_approved',
    title: 'Return approved',
    body: 'An RMA was approved.',
  });
  await notifications.markRead(storeId, userB, targetedBRead.id);

  console.log('[seed] send_log rows (sent/failed/dead/pending)...');
  const rows: Array<Partial<SendLog>> = [
    {
      storeId,
      channel: SendChannel.Email,
      recipient: 'ada@example.com',
      templateKind: TemplateKind.Refund,
      renderedSubject: 'A refund was issued for order 1042',
      renderedBody: 'Hi Ada,\n\nA refund has been issued for your order 1042.',
      status: SendStatus.Sent,
      attempt: 1,
      providerMessageId: `mock_email_${ulid()}`,
      sourceEventId: `seed-sent-${ulid()}`,
    },
    {
      storeId,
      channel: SendChannel.Email,
      recipient: 'bounced.fail@example.com',
      templateKind: TemplateKind.Custom,
      renderedSubject: 'A message from your store',
      renderedBody: 'This one bounced.',
      status: SendStatus.Failed,
      attempt: 1,
      failureReason: 'provider reported bounce',
      sourceEventId: `seed-failed-${ulid()}`,
    },
    {
      storeId,
      channel: SendChannel.Sms,
      recipient: '+15550000000.fail',
      templateKind: TemplateKind.Custom,
      renderedBody: 'Low stock alert.',
      status: SendStatus.Dead,
      attempt: 5,
      failureReason: 'mock sms provider: deterministic failure (recipient ends in .fail)',
      sourceEventId: `seed-dead-${ulid()}`,
    },
    {
      storeId,
      channel: SendChannel.WhatsApp,
      recipient: '+15551234567',
      templateKind: TemplateKind.ShipmentDelay,
      renderedBody: 'Your order has been delayed.',
      status: SendStatus.Pending,
      attempt: 2,
      failureReason: 'mock whatsapp provider: transient failure',
      sourceEventId: `seed-pending-${ulid()}`,
    },
  ];
  for (const row of rows) {
    await sendLogRepo.save(sendLogRepo.create(row));
  }

  console.log('[seed] done. Summary:');
  console.log(`[seed]   storeId:              ${storeId}`);
  console.log(`[seed]   templates:            ${refundTemplate.name}, ${campaignTemplate.name}`);
  console.log(`[seed]   notifications:        broadcast=${broadcast.id}, targetedA=${targetedA.id} (unread), targetedB=${targetedBRead.id} (read)`);
  console.log(`[seed]   send_log:             ${rows.length} rows (sent/failed/dead/pending)`);
  console.log(
    '[seed] fetch them via the gateway once notification-service is up: ' +
      'GET /api/notifications/templates, GET /api/notifications (needs a JWT for this storeId).',
  );

  await app.close();
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
