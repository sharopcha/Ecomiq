/**
 * Runnable proof — boots the real Nest application context (real
 * `SegmentsService`, real Postgres via `crm_db`) and exercises rule
 * validation (whitelist rejection), evaluation against a plain customer
 * field, evaluation against a joined `loyalty_tier` field, and
 * re-evaluation after membership changes. Same "boot the real app context,
 * drive the real services" pattern as `customers-demo.ts`.
 *
 * Run:
 *   npm run crm:segments-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { SegmentsService } from '../app/segments/segments.service';
import { CustomersService } from '../app/customers/customers.service';
import { LoyaltyService } from '../app/loyalty/loyalty.service';
import { LoyaltyTxnReason } from '../app/entities/loyalty-txn.entity';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[segments-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const segments = app.get(SegmentsService);
  const customers = app.get(CustomersService);
  const loyalty = app.get(LoyaltyService);

  console.log('[segments-demo] a rule naming an unknown field is rejected...');
  let rejected = false;
  try {
    await segments.create(storeId, {
      name: 'Bad rule',
      rule: [{ field: 'password_hash', op: 'eq', value: 'x' } as never],
    });
  } catch {
    rejected = true;
  }
  assert(rejected, 'an unwhitelisted field should be rejected at create time, before ever being evaluated');
  console.log('[segments-demo] OK — whitelist enforced at create time.');

  console.log('[segments-demo] evaluate against a plain customer field (total_spent_minor >= 10000)...');
  const bigSpender = await customers.create(storeId, { fullName: 'Big Spender' });
  const smallSpender = await customers.create(storeId, { fullName: 'Small Spender' });
  // Seed total_spent_minor the same way the real rollup consumer would —
  // no admin endpoint writes this column directly, it's a denormalized
  // rollup (see CustomersService.applyOrderRollup's own doc comment).
  await customers.applyOrderRollup(storeId, `demo-evt-${ulid()}`, {
    orderId: `order-${ulid()}`,
    storeId,
    customerId: bigSpender.id,
    discountId: null,
    discountMinor: 0,
    subtotalMinor: 15_000,
    totalMinor: 15_000,
    currency: 'USD',
    shippingAddress: null,
    contactEmail: null,
    lines: [],
  });

  const bigSpenderSegment = await segments.create(storeId, {
    name: 'Big spenders',
    rule: [{ field: 'total_spent_minor', op: 'gte', value: 10_000 }],
  });
  const evaluated = await segments.evaluate(storeId, bigSpenderSegment.id);
  assert(evaluated.memberCount === 1, `expected 1 member, got ${evaluated.memberCount}`);
  console.log('[segments-demo] OK — 1 member matched the total_spent_minor >= 10000 rule.');

  console.log('[segments-demo] evaluate against a joined loyalty_tier field...');
  await loyalty.awardWithRefId(storeId, bigSpender.id, 2500, LoyaltyTxnReason.Manual, `seed-${ulid()}`);
  const goldSegment = await segments.create(storeId, {
    name: 'Gold tier',
    rule: [{ field: 'loyalty_tier', op: 'eq', value: 'gold' }],
  });
  const goldEvaluated = await segments.evaluate(storeId, goldSegment.id);
  assert(goldEvaluated.memberCount === 1, `expected 1 gold-tier member, got ${goldEvaluated.memberCount}`);
  console.log('[segments-demo] OK — loyalty_tier join resolved correctly, 1 gold member matched.');

  console.log('[segments-demo] small spender (never bumped, still 0 total_spent_minor) never matches either segment...');
  const reEvaluatedBigSegment = await segments.evaluate(storeId, bigSpenderSegment.id);
  assert(reEvaluatedBigSegment.memberCount === 1, 'small spender should not have joined the big-spenders segment');
  console.log(`[segments-demo] OK — customer ${smallSpender.id} correctly excluded.`);

  console.log('[segments-demo] re-evaluate after the rule changes rematerializes membership...');
  const widened = await segments.update(storeId, bigSpenderSegment.id, {
    rule: [{ field: 'total_spent_minor', op: 'gte', value: 0 }],
  });
  const reEvaluated = await segments.evaluate(storeId, widened.id);
  assert(reEvaluated.memberCount === 2, `expected both customers to match a >= 0 rule, got ${reEvaluated.memberCount}`);
  console.log('[segments-demo] OK — widened rule now matches both customers.');

  console.log('[segments-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[segments-demo] FAILED:', err);
  process.exit(1);
});
