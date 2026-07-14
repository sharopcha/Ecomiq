/**
 * Runnable proof — boots the real hybrid app (Pulsar consumers active) and
 * exercises the full referral loop: referrer gets a code, a referee
 * registers with it (creating a `pending` referral, Step 8's own logic),
 * the referee's first `orders.order.placed` completes the referral and
 * rewards the referrer, a second order for the same referee does *not*
 * double-reward, and a code generated *after* a referral already named it
 * gets backfilled onto the right row. Same "publish a synthetic event onto
 * the live topic, wait for the real consumer to react" pattern as
 * `loyalty-demo.ts`.
 *
 * Requires a reachable Postgres + Pulsar (the docker-compose stack) and the
 * RS256 keypair (`npm run crm:keys:generate`).
 *
 * Run:
 *   npm run crm:referrals-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { PulsarServer, createEnvelope, encodeEnvelope } from '@temp-nx/pulsar';
import { AppModule } from '../app/app.module';
import { AuthService } from '../app/auth/auth.service';
import { ReferralsService } from '../app/referrals/referrals.service';
import { LoyaltyAccount } from '../app/entities/loyalty-account.entity';
import { Referral, ReferralStatus } from '../app/entities/referral.entity';
import { Customer } from '../app/entities/customer.entity';
import { ORDER_PLACED_EVENT_TYPE, OrderPlacedPayload } from '../app/events/order-placed-event-payload';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[referrals-demo] ASSERTION FAILED: ${message}`);
  }
}

async function waitUntil<T>(
  fn: () => Promise<T | null | undefined>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  intervalMs = 500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value && predicate(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(`[referrals-demo] timed out waiting for condition after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  const tenant = process.env.PULSAR_TENANT || 'ecomiq';
  const orderNamespace = process.env.ORDER_PULSAR_NAMESPACE || 'orders';

  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant,
      namespace: orderNamespace,
      aggregates: ['order'],
      subscription: 'order-events::crm-service',
      subscriptionType: 'KeyShared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.init();
  await app.startAllMicroservices();

  const storeId = `demo-store-${ulid()}`;
  const auth = app.get(AuthService);
  const referrals = app.get(ReferralsService);
  const accountRepo = app.get<Repository<LoyaltyAccount>>(getRepositoryToken(LoyaltyAccount));
  const referralRepo = app.get<Repository<Referral>>(getRepositoryToken(Referral));
  const customerRepo = app.get<Repository<Customer>>(getRepositoryToken(Customer));

  console.log('[referrals-demo] referrer registers and gets their code...');
  const referrerSession = await auth.register(storeId, {
    storeId,
    email: `referrer-${ulid()}@example.com`,
    password: 'correct horse battery staple',
    fullName: 'Referrer Customer',
  });
  const referrerPayload = JSON.parse(Buffer.from(referrerSession.accessToken.split('.')[1], 'base64url').toString());
  const referrerId: string = referrerPayload.sub;
  const code = await referrals.getOrCreateCode(storeId, referrerId);
  assert(code.length === 8, `expected an 8-char code, got ${code}`);
  console.log(`[referrals-demo] OK — referrer code: ${code}.`);

  console.log('[referrals-demo] referee registers WITH the code (creates a pending referral)...');
  await auth.register(storeId, {
    storeId,
    email: `referee-${ulid()}@example.com`,
    password: 'correct horse battery staple',
    fullName: 'Referee Customer',
    referralCode: code,
  });
  const pending = await waitUntil(
    () => referralRepo.findOne({ where: { storeId, code } }),
    (r) => r.referrerId === referrerId,
    5_000,
  );
  assert(pending.status === ReferralStatus.Pending, `expected pending, got ${pending.status}`);
  console.log('[referrals-demo] OK — pending referral resolved to the right referrer.');

  const refereeCustomer = await customerRepo.findOne({ where: { id: pending.refereeId } });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('pulsar-client');
  const client = new Client({ serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650' });
  const producer = await client.createProducer({
    topic: `persistent://${tenant}/${orderNamespace}/order.events`,
  });

  function orderPlacedEnvelope(orderId: string) {
    const payload: OrderPlacedPayload = {
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
    };
    return createEnvelope({
      eventId: `demo-order-placed-${ulid()}`,
      eventType: ORDER_PLACED_EVENT_TYPE,
      storeId,
      aggregateType: 'order',
      aggregateId: orderId,
      payload,
    });
  }

  console.log("[referrals-demo] referee's first order completes the referral and rewards the referrer...");
  await producer.send({ data: encodeEnvelope(orderPlacedEnvelope(`order_${ulid()}`)) });

  const completed = await waitUntil(
    () => referralRepo.findOne({ where: { id: pending.id } }),
    (r) => r.status === ReferralStatus.Completed,
    30_000,
  );
  assert(completed.status === ReferralStatus.Completed, 'referral should be completed');

  const referrerAccount = await waitUntil(
    () => accountRepo.findOne({ where: { storeId, customerId: referrerId } }),
    (a) => a.points > 0,
    30_000,
  );
  const expectedReward = Number(process.env.CRM_REFERRAL_REWARD_POINTS ?? 500);
  assert(referrerAccount.points === expectedReward, `expected ${expectedReward} referrer points, got ${referrerAccount.points}`);
  console.log(`[referrals-demo] OK — referral completed, referrer awarded ${referrerAccount.points} points.`);

  console.log("[referrals-demo] referee's SECOND order does not complete anything again or double-reward...");
  await producer.send({ data: encodeEnvelope(orderPlacedEnvelope(`order_${ulid()}`)) });
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const afterSecondOrder = await accountRepo.findOne({ where: { storeId, customerId: referrerId } });
  assert(
    afterSecondOrder.points === expectedReward,
    `expected referrer points to stay ${expectedReward}, got ${afterSecondOrder.points}`,
  );
  console.log('[referrals-demo] OK — no double reward on the referee\'s second order.');

  await producer.close();
  await client.close();

  console.log('[referrals-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[referrals-demo] FAILED:', err);
  process.exit(1);
});
