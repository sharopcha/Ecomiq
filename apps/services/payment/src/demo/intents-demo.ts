/**
 * Runnable proof — boots the real Nest application context (real
 * `PaymentsService`, real
 * `MockPaymentProvider`, real Postgres via `payment_db`) and exercises the
 * full createIntent/cancel flow, same "boot the real app context, drive
 * the real services" pattern as catalog/inventory's `src/demo/seed.ts`.
 * Requires a reachable Postgres + Pulsar (the docker-compose stack, or
 * anything matching the PAYMENT_DB_ and PULSAR_ env vars).
 *
 * Run:
 *   npm run payment:intents-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { PaymentsService } from '../app/payments/payments.service';
import { PaymentEventType } from '../app/events/payment-event-types';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const orderId = `demo-order-${ulid()}`;
  const idempotencyKey = `demo-idem-${ulid()}`;

  const payments = app.get(PaymentsService);
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));

  console.log('[intents-demo] creating intent...');
  const first = await payments.createIntent(storeId, {
    orderId,
    amountMinor: 1500,
    currency: 'USD',
    idempotencyKey,
  });
  assert(first.created === true, 'first createIntent should report created: true');
  assert(first.payment.status === 'pending', 'new payment should be pending');
  assert(!!first.payment.externalRef, 'externalRef should be set by the mock provider');
  assert(!!first.payment.clientSecret, 'clientSecret should be set by the mock provider');

  const outboxAfterFirst = await outboxRepo.count({
    where: { aggregateId: first.payment.id, eventType: PaymentEventType.PaymentCreated },
  });
  assert(outboxAfterFirst === 1, `expected exactly 1 payments.payment.created outbox row, got ${outboxAfterFirst}`);
  console.log(`[intents-demo] OK — payment ${first.payment.id} created, 1 outbox row.`);

  console.log('[intents-demo] replaying createIntent with the same idempotencyKey...');
  const replay = await payments.createIntent(storeId, {
    orderId,
    amountMinor: 1500,
    currency: 'USD',
    idempotencyKey,
  });
  assert(replay.created === false, 'replayed createIntent should report created: false');
  assert(replay.payment.id === first.payment.id, 'replay should return the same Payment row');

  const outboxAfterReplay = await outboxRepo.count({
    where: { aggregateId: first.payment.id, eventType: PaymentEventType.PaymentCreated },
  });
  assert(
    outboxAfterReplay === 1,
    `replay must not create a second outbox row, got ${outboxAfterReplay}`,
  );
  console.log('[intents-demo] OK — replay returned the same row, no duplicate outbox row.');

  console.log('[intents-demo] canceling...');
  const canceled = await payments.cancelIntent(storeId, first.payment.id);
  assert(canceled.status === 'canceled', 'payment should be canceled');

  const outboxCanceled = await outboxRepo.count({
    where: { aggregateId: first.payment.id, eventType: PaymentEventType.PaymentCanceled },
  });
  assert(outboxCanceled === 1, `expected exactly 1 payments.payment.canceled outbox row, got ${outboxCanceled}`);
  console.log('[intents-demo] OK — canceled, outbox row present.');

  console.log('[intents-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[intents-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[intents-demo] FAILED:', err);
  process.exit(1);
});
