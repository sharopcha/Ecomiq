/**
 * Runnable proof — boots the real Nest application context (real
 * `WishlistService`, real Postgres via `crm_db`) and exercises add/list/
 * remove plus the duplicate-add idempotency guarantee, same "boot the real
 * app context, drive the real services" pattern as `customers-demo.ts`.
 *
 * Run:
 *   npm run crm:wishlist-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { WishlistService } from '../app/wishlist/wishlist.service';
import { CustomersService } from '../app/customers/customers.service';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[wishlist-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const wishlist = app.get(WishlistService);
  const customers = app.get(CustomersService);

  const customer = await customers.create(storeId, { fullName: 'Wishlist Demo Customer' });
  const variantId = `variant-${ulid()}`;
  const secondVariantId = `variant-${ulid()}`;

  console.log('[wishlist-demo] add + list...');
  await wishlist.add(storeId, customer.id, variantId);
  await wishlist.add(storeId, customer.id, secondVariantId);
  let items = await wishlist.list(storeId, customer.id);
  assert(items.length === 2, `expected 2 items, got ${items.length}`);
  console.log('[wishlist-demo] OK.');

  console.log('[wishlist-demo] duplicate add is idempotent (unique constraint, ON CONFLICT DO NOTHING)...');
  await wishlist.add(storeId, customer.id, variantId);
  items = await wishlist.list(storeId, customer.id);
  assert(items.length === 2, `expected duplicate add to stay at 2 items, got ${items.length}`);
  console.log('[wishlist-demo] OK — no duplicate row created.');

  console.log('[wishlist-demo] remove...');
  await wishlist.remove(storeId, customer.id, variantId);
  items = await wishlist.list(storeId, customer.id);
  assert(items.length === 1 && items[0].variantId === secondVariantId, 'expected only the second variant to remain');
  console.log('[wishlist-demo] OK — item removed.');

  console.log('[wishlist-demo] cross-store isolation...');
  const otherStoreItems = await wishlist.list(`other-store-${ulid()}`, customer.id);
  assert(otherStoreItems.length === 0, 'a different storeId should see no items');
  console.log('[wishlist-demo] OK.');

  console.log('[wishlist-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[wishlist-demo] FAILED:', err);
  process.exit(1);
});
