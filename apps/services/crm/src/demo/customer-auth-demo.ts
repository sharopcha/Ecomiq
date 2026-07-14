/**
 * Runnable proof — boots the real Nest application context (real
 * `AuthService`/`KeyService`/`RefreshTokenService`, real Postgres via
 * `crm_db`, real Redis) and exercises register -> login -> refresh
 * (rotation) -> reuse-detection -> logout, plus the JWKS endpoint and the
 * register-with-referralCode path. Same "boot the real app context, drive
 * the real services" pattern as `customers-demo.ts`.
 *
 * Requires the RS256 keypair to exist first: `npm run crm:keys:generate`.
 *
 * Run:
 *   npm run crm:customer-auth-demo
 */
import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { jwtVerify, importSPKI } from 'jose';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { AuthService } from '../app/auth/auth.service';
import { KeyService } from '../app/auth/key.service';
import { Referral } from '../app/entities/referral.entity';
import { Customer } from '../app/entities/customer.entity';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[customer-auth-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const auth = app.get(AuthService);
  const keys = app.get(KeyService);
  const referralRepo = app.get<Repository<Referral>>(getRepositoryToken(Referral));
  const customerRepo = app.get<Repository<Customer>>(getRepositoryToken(Customer));

  console.log('[customer-auth-demo] JWKS endpoint returns a well-formed key set...');
  const jwks = await keys.getJwks();
  assert(jwks.keys.length === 1, `expected exactly one JWK, got ${jwks.keys.length}`);
  assert(jwks.keys[0].use === 'sig' && jwks.keys[0].alg === 'RS256', 'JWK should be RS256/sig');
  console.log('[customer-auth-demo] OK.');

  console.log('[customer-auth-demo] register (with an unresolvable referralCode)...');
  const email = `ada-${ulid()}@example.com`;
  const registerSession = await auth.register(storeId, {
    storeId,
    email,
    password: 'correct horse battery staple',
    fullName: 'Ada Lovelace',
    referralCode: 'FRIEND123',
  });
  assert(registerSession.accessToken.length > 0, 'register should return an access token');
  assert(registerSession.refreshToken.length > 0, 'register should return a refresh token');

  const registered = await customerRepo.findOne({ where: { storeId, email } });
  assert(registered?.passwordHash != null, 'registered customer should have a password_hash');
  assert(registered?.registeredAt != null, 'registered customer should have registered_at stamped');
  assert(registered?.displayId.startsWith('CST-'), `unexpected displayId: ${registered?.displayId}`);

  const pendingReferral = await referralRepo.findOne({ where: { storeId, refereeId: registered!.id } });
  assert(pendingReferral?.code === 'FRIEND123', 'a pending referral row should exist with the submitted code');
  assert(pendingReferral?.referrerId == null, 'referrerId should be null — no customer owns that code yet');
  assert(pendingReferral?.status === 'pending', 'referral should start pending');
  console.log('[customer-auth-demo] OK — password_hash/registered_at stamped, CST-<n> assigned, pending referral row created.');

  console.log('[customer-auth-demo] access token verifies against the real public key with aud=customer...');
  const publicKeyPem = readFileSync(
    join(process.cwd(), process.env.CRM_JWT_PUBLIC_KEY_PATH || 'apps/services/crm/keys/public.pem'),
    'utf8',
  );
  const publicKeyImport = await importSPKI(publicKeyPem, 'RS256');
  const { payload } = await jwtVerify(registerSession.accessToken, publicKeyImport, {
    issuer: process.env.CRM_JWT_ISSUER || 'ecomiq-crm-customer',
  });
  assert(payload['aud'] === 'customer', `expected aud=customer, got ${payload['aud']}`);
  assert(payload['type'] === 'customer_access', `expected type=customer_access, got ${payload['type']}`);
  assert(payload['sub'] === registered!.id, 'sub should be the customer id');
  console.log('[customer-auth-demo] OK — aud/type/sub all correct on the signed token.');

  console.log('[customer-auth-demo] duplicate registration with the same email is rejected...');
  let duplicateRejected = false;
  try {
    await auth.register(storeId, { storeId, email, password: 'anotherpassword1', fullName: 'Impostor' });
  } catch {
    duplicateRejected = true;
  }
  assert(duplicateRejected, 'registering an already-registered email should be rejected');
  console.log('[customer-auth-demo] OK.');

  console.log('[customer-auth-demo] login with correct/incorrect passwords...');
  const loginSession = await auth.login(storeId, { storeId, email, password: 'correct horse battery staple' });
  assert(loginSession.accessToken.length > 0, 'login should return an access token');

  let wrongPasswordRejected = false;
  try {
    await auth.login(storeId, { storeId, email, password: 'wrong password' });
  } catch {
    wrongPasswordRejected = true;
  }
  assert(wrongPasswordRejected, 'login with the wrong password should be rejected');
  console.log('[customer-auth-demo] OK.');

  console.log('[customer-auth-demo] refresh rotates the token...');
  const firstRefresh = loginSession.refreshToken;
  const rotated = await auth.refresh(firstRefresh);
  assert(rotated.refreshToken !== firstRefresh, 'refresh should mint a brand-new refresh token');
  assert(rotated.accessToken.length > 0, 'refresh should mint a new access token');
  console.log('[customer-auth-demo] OK — refresh token rotated.');

  console.log('[customer-auth-demo] replaying the OLD (already-rotated) refresh token is detected as reuse...');
  let reuseDetected = false;
  try {
    await auth.refresh(firstRefresh);
  } catch (err) {
    reuseDetected = (err as Error).message.includes('reuse detected');
  }
  assert(reuseDetected, 'replaying a rotated-away refresh token should throw a reuse-detected error');
  console.log('[customer-auth-demo] OK — reuse detected.');

  console.log('[customer-auth-demo] the whole session family is revoked after reuse detection — even the NEW token now fails...');
  let newTokenAlsoRevoked = false;
  try {
    await auth.refresh(rotated.refreshToken);
  } catch {
    newTokenAlsoRevoked = true;
  }
  assert(newTokenAlsoRevoked, 'the rotated token should also be revoked once reuse was detected on its predecessor');
  console.log('[customer-auth-demo] OK — whole family revoked, not just the replayed token.');

  console.log('[customer-auth-demo] logout on a fresh session revokes it...');
  const freshLogin = await auth.login(storeId, { storeId, email, password: 'correct horse battery staple' });
  await auth.logout(freshLogin.refreshToken);
  let revokedAfterLogout = false;
  try {
    await auth.refresh(freshLogin.refreshToken);
  } catch {
    revokedAfterLogout = true;
  }
  assert(revokedAfterLogout, 'refresh should fail after logout');
  console.log('[customer-auth-demo] OK — logout revokes the session.');

  console.log('[customer-auth-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[customer-auth-demo] FAILED:', err);
  process.exit(1);
});
