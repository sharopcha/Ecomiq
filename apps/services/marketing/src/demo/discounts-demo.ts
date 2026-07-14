/**
 * Runnable proof — boots the real
 * Nest application context (real `DiscountsService`, Postgres via
 * `marketing_db`) and exercises CRUD + status transitions + outbox rows,
 * same "drive the real services" pattern as payment-service's
 * `intents-demo.ts`.
 *
 * Run:
 *   npm run marketing:discounts-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { DiscountsService } from '../app/discounts/discounts.service';
import { DiscountKind, DiscountStatus } from '../app/entities/discount.entity';
import { MarketingEventType } from '../app/events/marketing-event-types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[discounts-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${Date.now()}`;

  const discounts = app.get(DiscountsService);
  const outboxRepo = app.get<Repository<OutboxMessage>>(getRepositoryToken(OutboxMessage));

  console.log('[discounts-demo] creating a discount with a lowercase code...');
  const discount = await discounts.create(storeId, {
    code: 'save10',
    kind: DiscountKind.Percentage,
    value: 1000,
  });
  assert(discount.code === 'SAVE10', `expected code to be normalized to SAVE10, got ${discount.code}`);
  assert(discount.status === DiscountStatus.Draft, 'a new discount should start in draft');

  const createdOutbox = await outboxRepo.count({
    where: { aggregateId: discount.id, eventType: MarketingEventType.DiscountCreated },
  });
  assert(createdOutbox === 1, `expected 1 marketing.discount.created outbox row, got ${createdOutbox}`);
  console.log('[discounts-demo] OK — created, code normalized, 1 outbox row.');

  console.log('[discounts-demo] creating a duplicate code (case-insensitive) — expect a conflict...');
  try {
    await discounts.create(storeId, { code: 'SAVE10', kind: DiscountKind.Percentage, value: 500 });
    throw new Error('expected a duplicate code to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'ConflictException', 'expected a ConflictException');
    console.log('[discounts-demo] OK — duplicate code rejected.');
  }

  console.log('[discounts-demo] activating...');
  const activated = await discounts.activate(storeId, discount.id);
  assert(activated.status === DiscountStatus.Active, 'discount should be active');
  const activatedOutbox = await outboxRepo.count({
    where: { aggregateId: discount.id, eventType: MarketingEventType.DiscountActivated },
  });
  assert(activatedOutbox === 1, `expected 1 marketing.discount.activated outbox row, got ${activatedOutbox}`);
  console.log('[discounts-demo] OK — activated, 1 outbox row.');

  console.log('[discounts-demo] archiving...');
  const archived = await discounts.archive(storeId, discount.id);
  assert(archived.status === DiscountStatus.Archived, 'discount should be archived');
  const archivedOutbox = await outboxRepo.count({
    where: { aggregateId: discount.id, eventType: MarketingEventType.DiscountArchived },
  });
  assert(archivedOutbox === 1, `expected 1 marketing.discount.archived outbox row, got ${archivedOutbox}`);
  console.log('[discounts-demo] OK — archived, 1 outbox row.');

  console.log('[discounts-demo] archiving again — expect an idempotent no-op, no duplicate outbox row...');
  await discounts.archive(storeId, discount.id);
  const archivedOutboxAfterReplay = await outboxRepo.count({
    where: { aggregateId: discount.id, eventType: MarketingEventType.DiscountArchived },
  });
  assert(archivedOutboxAfterReplay === 1, 'repeated archive must not create a second outbox row');
  console.log('[discounts-demo] OK — repeated archive was a no-op.');

  console.log('[discounts-demo] trying to activate an archived discount — expect a conflict...');
  try {
    await discounts.activate(storeId, discount.id);
    throw new Error('expected activating an archived discount to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'ConflictException', 'expected a ConflictException');
    console.log('[discounts-demo] OK — activate-on-archived rejected.');
  }

  console.log('[discounts-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[discounts-demo] FAILED:', err);
  process.exit(1);
});
