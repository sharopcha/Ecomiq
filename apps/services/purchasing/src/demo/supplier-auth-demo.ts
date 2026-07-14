/**
 * Runnable proof — boots the real Nest application context (real
 * `AuthService`/`KeyService`/`RefreshTokenService`, real Postgres via
 * `purchasing_db`, real Redis) and exercises register-claims-by-email ->
 * login (stamps last_logged_in_at) -> refresh (rotation) -> reuse-detection
 * -> logout, plus the JWKS endpoint and the no-existing-supplier-row
 * rejection. Same "boot the real app context, drive the real services"
 * pattern as crm's `customer-auth-demo.ts`.
 *
 * Requires the RS256 keypair to exist first: `npm run purchasing:keys:generate`.
 *
 * Run:
 *   npm run purchasing:supplier-auth-demo
 */
import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { jwtVerify, importSPKI } from 'jose';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { AuthService } from '../app/auth/auth.service';
import { KeyService } from '../app/auth/key.service';
import { SuppliersService } from '../app/suppliers/suppliers.service';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[supplier-auth-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const auth = app.get(AuthService);
  const keys = app.get(KeyService);
  const suppliers = app.get(SuppliersService);

  console.log('[supplier-auth-demo] JWKS endpoint returns a well-formed key set...');
  const jwks = await keys.getJwks();
  assert(jwks.keys.length === 1, `expected exactly one JWK, got ${jwks.keys.length}`);
  assert(jwks.keys[0].use === 'sig' && jwks.keys[0].alg === 'RS256', 'JWK should be RS256/sig');
  console.log('[supplier-auth-demo] OK.');

  const email = `acme-${ulid()}@example.com`;

  console.log('[supplier-auth-demo] register with no existing supplier row is rejected (no self-serve creation)...');
  let noSupplierRejected = false;
  try {
    await auth.register(storeId, { storeId, email, password: 'correct horse battery staple' });
  } catch {
    noSupplierRejected = true;
  }
  assert(noSupplierRejected, 'register must be rejected when no admin-created supplier row exists for the email');
  console.log('[supplier-auth-demo] OK.');

  console.log('[supplier-auth-demo] admin creates the supplier, then register claims that existing row...');
  const supplier = await suppliers.create(storeId, { name: 'Acme Textiles', email });
  assert(supplier.passwordHash == null, 'admin-created supplier should have no password_hash yet');

  const registerSession = await auth.register(storeId, {
    storeId,
    email,
    password: 'correct horse battery staple',
  });
  assert(registerSession.accessToken.length > 0, 'register should return an access token');
  assert(registerSession.refreshToken.length > 0, 'register should return a refresh token');

  const claimed = await suppliers.findOne(storeId, supplier.id);
  assert(claimed.passwordHash != null, 'claimed supplier should have a password_hash');
  assert(claimed.registeredAt != null, 'claimed supplier should have registered_at stamped');
  assert(claimed.lastLoggedInAt == null, 'registered_at is stamped, but last_logged_in_at should still be null before any login');
  console.log('[supplier-auth-demo] OK — password_hash/registered_at stamped on the existing row, no new supplier created.');

  console.log('[supplier-auth-demo] access token verifies against the real public key with aud=supplier...');
  const publicKeyPem = readFileSync(
    join(process.cwd(), process.env.PURCHASING_JWT_PUBLIC_KEY_PATH || 'apps/services/purchasing/keys/public.pem'),
    'utf8',
  );
  const publicKeyImport = await importSPKI(publicKeyPem, 'RS256');
  const { payload } = await jwtVerify(registerSession.accessToken, publicKeyImport, {
    issuer: process.env.PURCHASING_JWT_ISSUER || 'ecomiq-purchasing-supplier',
  });
  assert(payload['aud'] === 'supplier', `expected aud=supplier, got ${payload['aud']}`);
  assert(payload['type'] === 'supplier_access', `expected type=supplier_access, got ${payload['type']}`);
  assert(payload['sub'] === supplier.id, 'sub should be the supplier id');
  console.log('[supplier-auth-demo] OK — aud/type/sub all correct on the signed token.');

  console.log('[supplier-auth-demo] re-registering an already-registered supplier is rejected...');
  let duplicateRejected = false;
  try {
    await auth.register(storeId, { storeId, email, password: 'anotherpassword1' });
  } catch {
    duplicateRejected = true;
  }
  assert(duplicateRejected, 'registering an already-registered supplier should be rejected');
  console.log('[supplier-auth-demo] OK.');

  console.log('[supplier-auth-demo] login stamps last_logged_in_at, resolving the data model\'s [GAP]...');
  const loginSession = await auth.login(storeId, { storeId, email, password: 'correct horse battery staple' });
  assert(loginSession.accessToken.length > 0, 'login should return an access token');
  const afterLogin = await suppliers.findOne(storeId, supplier.id);
  assert(afterLogin.lastLoggedInAt != null, 'login should stamp last_logged_in_at');

  let wrongPasswordRejected = false;
  try {
    await auth.login(storeId, { storeId, email, password: 'wrong password' });
  } catch {
    wrongPasswordRejected = true;
  }
  assert(wrongPasswordRejected, 'login with the wrong password should be rejected');
  console.log('[supplier-auth-demo] OK — last_logged_in_at stamped, wrong password rejected.');

  console.log('[supplier-auth-demo] refresh rotates the token...');
  const firstRefresh = loginSession.refreshToken;
  const rotated = await auth.refresh(firstRefresh);
  assert(rotated.refreshToken !== firstRefresh, 'refresh should mint a brand-new refresh token');
  assert(rotated.accessToken.length > 0, 'refresh should mint a new access token');
  console.log('[supplier-auth-demo] OK — refresh token rotated.');

  console.log('[supplier-auth-demo] replaying the OLD (already-rotated) refresh token is detected as reuse...');
  let reuseDetected = false;
  try {
    await auth.refresh(firstRefresh);
  } catch (err) {
    reuseDetected = (err as Error).message.includes('reuse detected');
  }
  assert(reuseDetected, 'replaying a rotated-away refresh token should throw a reuse-detected error');
  console.log('[supplier-auth-demo] OK — reuse detected.');

  console.log('[supplier-auth-demo] the whole session family is revoked after reuse detection — even the NEW token now fails...');
  let newTokenAlsoRevoked = false;
  try {
    await auth.refresh(rotated.refreshToken);
  } catch {
    newTokenAlsoRevoked = true;
  }
  assert(newTokenAlsoRevoked, 'the rotated token should also be revoked once reuse was detected on its predecessor');
  console.log('[supplier-auth-demo] OK — whole family revoked, not just the replayed token.');

  console.log('[supplier-auth-demo] logout on a fresh session revokes it...');
  const freshLogin = await auth.login(storeId, { storeId, email, password: 'correct horse battery staple' });
  await auth.logout(freshLogin.refreshToken);
  let revokedAfterLogout = false;
  try {
    await auth.refresh(freshLogin.refreshToken);
  } catch {
    revokedAfterLogout = true;
  }
  assert(revokedAfterLogout, 'refresh should fail after logout');
  console.log('[supplier-auth-demo] OK — logout revokes the session.');

  console.log('[supplier-auth-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[supplier-auth-demo] FAILED:', err);
  process.exit(1);
});
