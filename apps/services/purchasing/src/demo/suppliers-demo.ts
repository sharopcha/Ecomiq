/**
 * Runnable proof — boots the real Nest application context (real
 * `SuppliersService`, real Postgres via `purchasing_db`) and exercises
 * supplier CRUD, same "boot the real app context, drive the real services"
 * pattern as crm's `customers-demo.ts`.
 *
 * Run:
 *   npm run purchasing:suppliers-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { SuppliersService } from '../app/suppliers/suppliers.service';
import { SupplierStatus } from '../app/entities/supplier.entity';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const suppliers = app.get(SuppliersService);

  console.log('[suppliers-demo] supplier CRUD...');
  const supplier = await suppliers.create(storeId, {
    name: 'Acme Textiles',
    email: 'sales@acme-textiles.example',
    phone: '+15550100',
  });
  assert(supplier.displayId === 'SUP-1', `expected first supplier to be SUP-1, got ${supplier.displayId}`);
  assert(supplier.status === SupplierStatus.Active, 'new supplier should default to active status');
  assert(supplier.ratingCount === 0, 'new supplier should start with ratingCount 0');

  const second = await suppliers.create(storeId, { name: 'Northwind Fabrics' });
  assert(second.displayId === 'SUP-2', `expected sequence to increment, got ${second.displayId}`);
  console.log('[suppliers-demo] OK — SUP-<n> sequence increments per store.');

  const list = await suppliers.findAll(storeId, { limit: 10 } as never);
  assert(list.items.length === 2, `expected 2 suppliers, got ${list.items.length}`);

  const searched = await suppliers.findAll(storeId, { limit: 10, search: 'acme' } as never);
  assert(
    searched.items.length === 1 && searched.items[0].id === supplier.id,
    'ILIKE search on name/email should find Acme by a lowercase substring',
  );
  console.log('[suppliers-demo] OK — list + search filter.');

  const updated = await suppliers.update(storeId, supplier.id, { phone: '+15550199' });
  assert(updated.phone === '+15550199', 'update should persist the new phone');

  const deactivated = await suppliers.deactivate(storeId, second.id);
  assert(deactivated.status === SupplierStatus.Inactive, 'deactivate should set status to inactive');

  const reactivated = await suppliers.activate(storeId, second.id);
  assert(reactivated.status === SupplierStatus.Active, 'activate should set status back to active');

  const activeOnly = await suppliers.findAll(storeId, { limit: 10, status: SupplierStatus.Active } as never);
  assert(activeOnly.items.length === 2, 'both suppliers should be active again after reactivation');
  console.log('[suppliers-demo] OK — update, activate/deactivate, and status filter confirmed.');

  const featured = await suppliers.toggleFeature(storeId, supplier.id);
  assert(featured.isFeatured === true, 'toggleFeature should flip isFeatured to true');
  const unfeatured = await suppliers.toggleFeature(storeId, supplier.id);
  assert(unfeatured.isFeatured === false, 'toggleFeature should flip isFeatured back to false');

  const favorited = await suppliers.toggleFavorite(storeId, supplier.id);
  assert(favorited.isFavorite === true, 'toggleFavorite should flip isFavorite to true');

  const featuredOnly = await suppliers.findAll(storeId, { limit: 10, favorite: true } as never);
  assert(
    featuredOnly.items.length === 1 && featuredOnly.items[0].id === supplier.id,
    'favorite filter should return only the favorited supplier',
  );
  console.log('[suppliers-demo] OK — feature/favorite toggles + filters confirmed.');

  console.log('[suppliers-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[suppliers-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[suppliers-demo] FAILED:', err);
  process.exit(1);
});
