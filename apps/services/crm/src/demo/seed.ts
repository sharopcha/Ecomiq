/**
 * Demo seed data for crm-service: 20 customers (mixed `source`, some
 * registered with a password), 3 reviews (one per `ReviewStatus`), a
 * segment, loyalty balances across all three tiers, and one fully
 * completed referral (referrer code generated, referee registers with
 * it, referee's first order completes it and awards the referrer).
 * Mirrors marketing/inventory's `src/demo/seed.ts` conventions (boots the
 * real Nest app context, `--store=` arg, timestamp-suffixed unique values
 * so a rerun just adds a fresh set rather than colliding on unique
 * constraints like `(store_id, email)`/`(store_id, referral_code)`).
 *
 *   docker compose up -d postgres redis pulsar
 *   npm run crm:seed
 *   npm run crm:seed -- --store=my-demo-store   # pin a specific storeId
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { CustomersService } from '../app/customers/customers.service';
import { Customer, CustomerSource } from '../app/entities/customer.entity';
import { AuthService } from '../app/auth/auth.service';
import { ReviewsService } from '../app/reviews/reviews.service';
import { LoyaltyService } from '../app/loyalty/loyalty.service';
import { LoyaltyTxnReason } from '../app/entities/loyalty-txn.entity';
import { ReferralsService } from '../app/referrals/referrals.service';
import { SegmentsService } from '../app/segments/segments.service';

function storeIdFromArgs(): string {
  const arg = process.argv.find((a) => a.startsWith('--store='));
  return arg ? arg.slice('--store='.length) : 'demo-store';
}

const SOURCES = [
  CustomerSource.OnlineStore,
  CustomerSource.Pos,
  CustomerSource.Manual,
  CustomerSource.Marketplace,
  CustomerSource.MobileApp,
];

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = storeIdFromArgs();
  const suffix = Date.now();
  console.log(`[seed] seeding crm demo data for storeId=${storeId}`);

  const customers = app.get(CustomersService);
  const customerRepo = app.get<Repository<Customer>>(getRepositoryToken(Customer));
  const auth = app.get(AuthService);
  const reviews = app.get(ReviewsService);
  const loyalty = app.get(LoyaltyService);
  const referrals = app.get(ReferralsService);
  const segments = app.get(SegmentsService);

  console.log('[seed] 20 customers (mixed source, 4 registered with a password)...');
  const registered = [];
  for (let i = 0; i < 4; i++) {
    const session = await auth.register(storeId, {
      storeId,
      email: `registered${i}-${suffix}@example.com`,
      password: 'seed-password-123',
      fullName: `Registered Customer ${i + 1}`,
    });
    registered.push(session);
  }

  const adminCreated = [];
  for (let i = 0; i < 16; i++) {
    // Every 5th admin-created customer has no email — a realistic
    // imported/manual row, matching the schema's genuinely-nullable email.
    const hasEmail = i % 5 !== 0;
    const customer = await customers.create(storeId, {
      fullName: `Seed Customer ${i + 1}`,
      email: hasEmail ? `seed${i}-${suffix}@example.com` : undefined,
      source: SOURCES[i % SOURCES.length],
    });
    adminCreated.push(customer);
  }
  console.log(`[seed] OK — ${registered.length} registered + ${adminCreated.length} admin-created customers.`);

  console.log('[seed] 3 reviews (one per status: pending, published, archived)...');
  const reviewCustomer = adminCreated[0];
  const pendingReview = await reviews.create(storeId, {
    productId: `product_${ulid()}`,
    customerId: reviewCustomer.id,
    rating: 4,
    title: 'Pretty good',
    body: 'Does what it says.',
  });
  const publishedReviewSeed = await reviews.create(storeId, {
    productId: `product_${ulid()}`,
    customerId: adminCreated[1].id,
    rating: 5,
    title: 'Love it',
    body: 'Exactly what I needed.',
  });
  const publishedReview = await reviews.publish(storeId, publishedReviewSeed.id);
  const archivedReviewSeed = await reviews.create(storeId, {
    productId: `product_${ulid()}`,
    customerId: adminCreated[2].id,
    rating: 2,
    title: 'Not for me',
    body: 'Returned it.',
  });
  await reviews.publish(storeId, archivedReviewSeed.id);
  const archivedReview = await reviews.archive(storeId, archivedReviewSeed.id);
  console.log(
    `[seed] OK — reviews ${pendingReview.id} (pending), ${publishedReview.id} (published), ${archivedReview.id} (archived).`,
  );

  console.log('[seed] loyalty balances across all three tiers...');
  await loyalty.manualAdjust(storeId, adminCreated[3].id, 100, 'seed: bronze balance');
  await loyalty.manualAdjust(storeId, adminCreated[4].id, 750, 'seed: silver balance');
  await loyalty.manualAdjust(storeId, adminCreated[5].id, 2500, 'seed: gold balance');
  console.log('[seed] OK — bronze/silver/gold accounts seeded.');

  console.log('[seed] a segment (total_spent_minor >= 0, matches every seeded customer)...');
  const segment = await segments.create(storeId, {
    name: 'All seeded customers',
    rule: [{ field: 'total_spent_minor', op: 'gte', value: 0 }],
  });
  const evaluated = await segments.evaluate(storeId, segment.id);
  console.log(`[seed] OK — segment "${evaluated.name}" evaluated, memberCount=${evaluated.memberCount}.`);

  console.log('[seed] one completed referral (referrer code -> referee registers -> first order completes it)...');
  const referrer = adminCreated[6];
  const code = await referrals.getOrCreateCode(storeId, referrer.id);
  const refereeEmail = `referee-${suffix}@example.com`;
  await auth.register(storeId, {
    storeId,
    email: refereeEmail,
    password: 'seed-password-123',
    fullName: 'Referred Customer',
    referralCode: code,
  });
  const refereeCustomer = await customerRepo.findOneByOrFail({ storeId, email: refereeEmail });
  const orderId = `order_${ulid()}`;
  const rolledUp = await customers.applyOrderRollup(storeId, `seed-evt-${ulid()}`, {
    orderId,
    storeId,
    customerId: refereeCustomer.id,
    discountId: null,
    discountMinor: 0,
    subtotalMinor: 5_000,
    totalMinor: 5_000,
    currency: 'USD',
    shippingAddress: null,
    contactEmail: null,
    lines: [],
  });
  if (rolledUp) {
    await referrals.completeIfEligible(storeId, rolledUp, orderId);
  }
  console.log(`[seed] OK — referrer ${referrer.id} code ${code}, referee's first order completed the referral.`);

  console.log('[seed] done. Summary:');
  console.log(`[seed]   storeId:    ${storeId}`);
  console.log(`[seed]   customers:  ${registered.length + adminCreated.length} total (4 registered)`);
  console.log(`[seed]   reviews:    3 (pending/published/archived)`);
  console.log(`[seed]   segment:    ${segment.id} "${evaluated.name}" (${evaluated.memberCount} members)`);
  console.log(`[seed]   referral:   referrer=${referrer.id} code=${code} completed`);
  console.log(
    '[seed] fetch them via the gateway once crm-service is up: ' +
      'GET /api/crm/customers, GET /api/crm/reviews, GET /api/crm/segments (needs a JWT for this storeId).',
  );

  // A short grace period before closing: the outbox relay polls every
  // 1000ms in the background (see AppModule) — closing immediately after
  // the last insert can race its in-flight tick, producing harmless but
  // noisy "AlreadyClosed" warnings as Pulsar/Postgres connections tear
  // down mid-publish. All seed data is already committed by this point
  // regardless; this just lets the relay's last batch flush quietly.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await app.close();
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
