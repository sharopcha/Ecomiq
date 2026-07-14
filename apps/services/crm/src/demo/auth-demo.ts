/**
 * Runnable proof — boots the real Nest HTTP app (global prefix, cookie
 * parser, ValidationPipe, the real `CustomerJwtGuard` verifying over a real
 * HTTP fetch to crm's own JWKS endpoint) on an ephemeral port, then drives
 * the actual REST surface with real HTTP requests: register -> login ->
 * GET /storefront/me -> POST /storefront/reviews. Also confirms a customer
 * token is rejected on an admin route, and an anonymous request to
 * /storefront/me is rejected.
 *
 * Requires the RS256 keypair to exist first: `npm run crm:keys:generate`.
 *
 * Run:
 *   npm run crm:auth-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import cookieParser from 'cookie-parser';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { ReviewRequest } from '../app/entities/review-request.entity';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[auth-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  // CustomerJwtGuard's JWKS fetch is self-referential (CRM_JWKS_URI defaults
  // to crm-service's real port) — must be set to match wherever this demo
  // actually binds *before* AppModule reads it via ConfigService, or the
  // guard fetches the JWKS from the wrong (possibly unbound) port and every
  // customer-token request fails verification. A dedicated demo port (not
  // 3009) avoids colliding with a real crm-service already running locally.
  const demoPort = Number(process.env.CRM_DEMO_PORT ?? 3919);
  process.env.CRM_JWKS_URI = `http://localhost:${demoPort}/api/auth/jwks`;

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(demoPort);
  const baseUrl = await app.getUrl();

  const storeId = `demo-store-${ulid()}`;
  const email = `ada-${ulid()}@example.com`;
  const orderId = `order-${ulid()}`;

  console.log('[auth-demo] register...');
  const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, email, password: 'correct horse battery staple', fullName: 'Ada Lovelace' }),
  });
  assert(registerRes.status === 201 || registerRes.status === 200, `register expected 2xx, got ${registerRes.status}`);
  const registerBody = (await registerRes.json()) as { accessToken: string };
  assert(typeof registerBody.accessToken === 'string' && registerBody.accessToken.length > 0, 'register should return an accessToken');
  console.log('[auth-demo] OK — registered.');

  console.log('[auth-demo] login...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, email, password: 'correct horse battery staple' }),
  });
  assert(loginRes.status === 201 || loginRes.status === 200, `login expected 2xx, got ${loginRes.status}`);
  const { accessToken } = (await loginRes.json()) as { accessToken: string };
  console.log('[auth-demo] OK — logged in.');

  console.log('[auth-demo] GET /storefront/me with the customer bearer token...');
  const meRes = await fetch(`${baseUrl}/api/storefront/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert(meRes.status === 200, `GET /storefront/me expected 200, got ${meRes.status}`);
  const me = (await meRes.json()) as { id: string; email: string; displayId: string; passwordHash?: string };
  assert(me.email === email, `expected email ${email}, got ${me.email}`);
  assert(me.displayId.startsWith('CST-'), `unexpected displayId: ${me.displayId}`);
  assert(me.passwordHash === undefined, 'passwordHash must never be returned in the profile response');
  console.log('[auth-demo] OK — profile fetched over real HTTP through the real CustomerJwtGuard, no password_hash leak.');

  console.log('[auth-demo] GET /storefront/me with NO token is rejected...');
  const anonRes = await fetch(`${baseUrl}/api/storefront/me`);
  assert(anonRes.status === 401, `expected 401 for anonymous request, got ${anonRes.status}`);
  console.log('[auth-demo] OK — anonymous request rejected.');

  console.log('[auth-demo] the customer token is rejected on a staff-only admin route...');
  const adminRes = await fetch(`${baseUrl}/api/customers`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert(adminRes.status === 401, `expected 401 using a customer token on an admin route, got ${adminRes.status}`);
  console.log('[auth-demo] OK — customer token cannot pass the staff JwtAuthGuard.');

  console.log('[auth-demo] seeding an open review_request so the storefront review is allowed...');
  const reviewRequestRepo = app.get<Repository<ReviewRequest>>(getRepositoryToken(ReviewRequest));
  await reviewRequestRepo.save(reviewRequestRepo.create({ storeId, customerId: me.id, orderId, sentAt: new Date() }));

  console.log('[auth-demo] POST /storefront/reviews...');
  const productId = `product-${ulid()}`;
  const reviewRes = await fetch(`${baseUrl}/api/storefront/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ productId, orderId, rating: 5, title: 'Loved it', body: 'Great product' }),
  });
  assert(reviewRes.status === 201 || reviewRes.status === 200, `POST /storefront/reviews expected 2xx, got ${reviewRes.status}`);
  const review = (await reviewRes.json()) as { status: string; productId: string };
  assert(review.status === 'pending', `expected pending, got ${review.status}`);
  assert(review.productId === productId, 'review should be attached to the right product');
  console.log('[auth-demo] OK — review posted and auto-linked its review_request.');

  console.log('[auth-demo] posting a second review for an order with no open request is rejected...');
  const noRequestRes = await fetch(`${baseUrl}/api/storefront/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ productId, orderId: `order-${ulid()}`, rating: 4 }),
  });
  assert(noRequestRes.status === 403, `expected 403 with no open review request, got ${noRequestRes.status}`);
  console.log('[auth-demo] OK — rejected without an open review request.');

  console.log('[auth-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[auth-demo] FAILED:', err);
  process.exit(1);
});
