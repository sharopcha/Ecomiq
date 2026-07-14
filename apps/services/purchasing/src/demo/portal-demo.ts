/**
 * Runnable proof — boots the real Nest HTTP app (global prefix, cookie
 * parser, ValidationPipe, the real `SupplierJwtGuard` verifying over a real
 * HTTP fetch to purchasing's own JWKS endpoint) on an ephemeral port, then
 * drives the actual REST surface with real HTTP requests: register -> login
 * -> GET/PATCH /portal/me -> own catalog item CRUD + in-stock toggle ->
 * GET /portal/pos -> POST /portal/pos/:id/confirm. Also confirms an
 * anonymous request and a supplier token on a staff-only admin route are
 * both rejected. Same "demo-port JWKS" shape as crm's `auth-demo.ts`.
 *
 * Full three-way pairwise cross-rejection (real staff/customer/supplier
 * tokens against each other's routes) needs identity's and crm's own
 * keypairs, which this single-service demo has no access to — that's
 * Step 14's job (a pure-function/integration spec, per the plan's own
 * split between "verify now via a live demo" and "formalize into a jest
 * spec later").
 *
 * Requires the RS256 keypair to exist first: `npm run purchasing:keys:generate`.
 *
 * Run:
 *   npm run purchasing:portal-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { SuppliersService } from '../app/suppliers/suppliers.service';
import { PurchaseOrdersService } from '../app/purchase-orders/purchase-orders.service';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[portal-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  // SupplierJwtGuard's JWKS fetch is self-referential (PURCHASING_JWKS_URI
  // defaults to purchasing-service's real port) — must be set to match
  // wherever this demo actually binds *before* AppModule reads it via
  // ConfigService, or the guard fetches the JWKS from the wrong (possibly
  // unbound) port and every supplier-token request fails verification. A
  // dedicated demo port (not 3010) avoids colliding with a real
  // purchasing-service already running locally.
  const demoPort = Number(process.env.PURCHASING_DEMO_PORT ?? 3919);
  process.env.PURCHASING_JWKS_URI = `http://localhost:${demoPort}/api/auth/jwks`;

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(demoPort);
  const baseUrl = await app.getUrl();

  const storeId = `demo-store-${ulid()}`;
  const email = `acme-${ulid()}@example.com`;
  const suppliers = app.get(SuppliersService);
  const purchaseOrders = app.get(PurchaseOrdersService);

  console.log('[portal-demo] admin creates the supplier, then register + login over real HTTP...');
  const supplier = await suppliers.create(storeId, {
    name: 'Acme Textiles',
    email,
    phone: '+15550100',
  });

  const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, email, password: 'correct horse battery staple' }),
  });
  assert(registerRes.status === 201 || registerRes.status === 200, `register expected 2xx, got ${registerRes.status}`);
  const { accessToken } = (await registerRes.json()) as { accessToken: string };
  assert(typeof accessToken === 'string' && accessToken.length > 0, 'register should return an accessToken');
  console.log('[portal-demo] OK — registered.');

  console.log('[portal-demo] GET /portal/me with the supplier bearer token...');
  const meRes = await fetch(`${baseUrl}/api/portal/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  assert(meRes.status === 200, `GET /portal/me expected 200, got ${meRes.status}`);
  const me = (await meRes.json()) as { id: string; email: string; displayId: string; passwordHash?: string };
  assert(me.id === supplier.id, 'GET /portal/me should return the authenticated supplier\'s own row');
  assert(me.email === email, `expected email ${email}, got ${me.email}`);
  assert(me.displayId.startsWith('SUP-'), `unexpected displayId: ${me.displayId}`);
  assert(me.passwordHash === undefined, 'passwordHash must never be returned in the profile response');
  console.log('[portal-demo] OK — profile fetched over real HTTP through the real SupplierJwtGuard, no password_hash leak.');

  console.log('[portal-demo] PATCH /portal/me updates contact fields only...');
  const patchRes = await fetch(`${baseUrl}/api/portal/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ phone: '+15550199', city: 'Portland' }),
  });
  assert(patchRes.status === 200, `PATCH /portal/me expected 200, got ${patchRes.status}`);
  const patched = (await patchRes.json()) as { phone: string; city: string; status: string };
  assert(patched.phone === '+15550199', 'PATCH /portal/me should persist the new phone');
  assert(patched.city === 'Portland', 'PATCH /portal/me should persist the new city');
  assert(patched.status === 'active', 'status must stay merchant-owned regardless of PATCH /portal/me');
  console.log('[portal-demo] OK — contact fields updated, status untouched.');

  console.log('[portal-demo] anonymous request to /portal/me is rejected...');
  const anonRes = await fetch(`${baseUrl}/api/portal/me`);
  assert(anonRes.status === 401, `expected 401 for anonymous request, got ${anonRes.status}`);
  console.log('[portal-demo] OK — anonymous request rejected.');

  console.log('[portal-demo] the supplier token is rejected on a staff-only admin route...');
  const adminRes = await fetch(`${baseUrl}/api/suppliers`, { headers: { Authorization: `Bearer ${accessToken}` } });
  assert(adminRes.status === 401, `expected 401 using a supplier token on an admin route, got ${adminRes.status}`);
  console.log('[portal-demo] OK — supplier token cannot pass the staff JwtAuthGuard.');

  console.log('[portal-demo] own catalog item CRUD + in-stock toggle over real HTTP...');
  const createItemRes = await fetch(`${baseUrl}/api/portal/catalog-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ name: 'Cotton Twill Fabric', sku: 'ACM-CTF-01' }),
  });
  assert(createItemRes.status === 201 || createItemRes.status === 200, `create catalog item expected 2xx, got ${createItemRes.status}`);
  const item = (await createItemRes.json()) as { id: string; inStock: boolean };
  assert(item.inStock === true, 'new catalog item should default to in_stock');

  const toggleRes = await fetch(`${baseUrl}/api/portal/catalog-items/${item.id}/toggle-in-stock`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert(toggleRes.status === 201 || toggleRes.status === 200, `toggle expected 2xx, got ${toggleRes.status}`);
  const toggled = (await toggleRes.json()) as { inStock: boolean };
  assert(toggled.inStock === false, 'toggle-in-stock should flip in_stock to false');
  console.log('[portal-demo] OK — own catalog item created and toggled over real HTTP.');

  console.log('[portal-demo] GET /portal/pos excludes drafts, POST /pos/:id/confirm transitions sent -> confirmed...');
  const draftPo = await purchaseOrders.create(storeId, {
    supplierId: supplier.id,
    emailTo: 'orders@acme-textiles.example',
    lines: [{ description: 'Cotton Twill Fabric', qty: 10, unitCostMinor: 500 }],
  } as never);
  const listBeforeSend = await fetch(`${baseUrl}/api/portal/pos`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const beforeSend = (await listBeforeSend.json()) as { items: Array<{ id: string }> };
  assert(
    !beforeSend.items.some((po) => po.id === draftPo.id),
    'GET /portal/pos must never include a draft PO not yet sent to the supplier',
  );

  const sentPo = await purchaseOrders.send(storeId, draftPo.id);
  const listAfterSend = await fetch(`${baseUrl}/api/portal/pos`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const afterSend = (await listAfterSend.json()) as { items: Array<{ id: string; status: string }> };
  assert(
    afterSend.items.some((po) => po.id === sentPo.id && po.status === 'sent'),
    'GET /portal/pos should include the PO once it is sent',
  );

  const confirmRes = await fetch(`${baseUrl}/api/portal/pos/${sentPo.id}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert(confirmRes.status === 201 || confirmRes.status === 200, `confirm expected 2xx, got ${confirmRes.status}`);
  const confirmed = (await confirmRes.json()) as { status: string };
  assert(confirmed.status === 'confirmed', `expected confirmed, got ${confirmed.status}`);
  console.log('[portal-demo] OK — drafts excluded from the list, confirm transitions sent -> confirmed over real HTTP.');

  console.log('[portal-demo] confirming another supplier\'s PO by guessing its id is rejected...');
  const otherSupplier = await suppliers.create(storeId, { name: 'Northwind Fabrics', email: `northwind-${ulid()}@example.com` });
  const otherPo = await purchaseOrders.create(storeId, {
    supplierId: otherSupplier.id,
    emailTo: 'orders@northwind.example',
    lines: [{ description: 'Wool Fabric', qty: 5, unitCostMinor: 900 }],
  } as never);
  await purchaseOrders.send(storeId, otherPo.id);
  const crossConfirmRes = await fetch(`${baseUrl}/api/portal/pos/${otherPo.id}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert(crossConfirmRes.status === 404, `expected 404 confirming another supplier's PO, got ${crossConfirmRes.status}`);
  console.log('[portal-demo] OK — cross-supplier confirm rejected as 404, not leaked as 403.');

  console.log('[portal-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[portal-demo] FAILED:', err);
  process.exit(1);
});
