/**
 * Runnable proof — boots the real Nest application context (real
 * `SuppliersService`/`SupplierCatalogItemsService`, real Postgres via
 * `purchasing_db`) and exercises supplier catalog item CRUD plus the
 * in-stock toggle and cross-store ownership check, same "boot the real app
 * context, drive the real services" pattern as crm's `customers-demo.ts`.
 *
 * Run:
 *   npm run purchasing:supplier-catalog-items-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { SuppliersService } from '../app/suppliers/suppliers.service';
import { SupplierCatalogItemsService } from '../app/supplier-catalog-items/supplier-catalog-items.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const suppliers = app.get(SuppliersService);
  const items = app.get(SupplierCatalogItemsService);

  console.log('[supplier-catalog-items-demo] catalog item CRUD...');
  const supplier = await suppliers.create(storeId, { name: 'Acme Textiles' });

  const item = await items.create(storeId, supplier.id, {
    name: 'Cotton Twill Fabric',
    sku: 'ACM-CTF-01',
    priceMinMinor: 500,
    priceMaxMinor: 900,
    minOrderQty: 50,
    variantId: 'variant-123',
  });
  assert(item.supplierId === supplier.id, 'created item should belong to the supplier');
  assert(item.inStock === true, 'new item should default to in_stock');

  const second = await items.create(storeId, supplier.id, { name: 'Linen Blend', sku: 'ACM-LB-02' });

  const list = await items.findAll(storeId, supplier.id, { limit: 10 } as never);
  assert(list.items.length === 2, `expected 2 catalog items, got ${list.items.length}`);

  const searched = await items.findAll(storeId, supplier.id, { limit: 10, search: 'twill' } as never);
  assert(
    searched.items.length === 1 && searched.items[0].id === item.id,
    'ILIKE search on name/sku should find the twill item by a lowercase substring',
  );
  console.log('[supplier-catalog-items-demo] OK — list + search filter.');

  const updated = await items.update(storeId, supplier.id, item.id, { minOrderQty: 100 });
  assert(updated.minOrderQty === 100, 'update should persist the new min_order_qty');

  const toggledOff = await items.toggleInStock(storeId, supplier.id, second.id);
  assert(toggledOff.inStock === false, 'toggleInStock should flip in_stock to false');
  const toggledOn = await items.toggleInStock(storeId, supplier.id, second.id);
  assert(toggledOn.inStock === true, 'toggleInStock should flip in_stock back to true');

  const inStockOnly = await items.findAll(storeId, supplier.id, { limit: 10, inStock: true } as never);
  assert(inStockOnly.items.length === 2, 'both items should be in_stock again after re-toggling');
  console.log('[supplier-catalog-items-demo] OK — update + in-stock toggle + filter confirmed.');

  await items.remove(storeId, supplier.id, second.id);
  const afterRemove = await items.findAll(storeId, supplier.id, { limit: 10 } as never);
  assert(afterRemove.items.length === 1, 'catalog item should be gone after remove');
  console.log('[supplier-catalog-items-demo] OK — remove confirmed.');

  let crossStoreRejected = false;
  try {
    await items.findAll(`other-store-${ulid()}`, supplier.id, { limit: 10 } as never);
  } catch {
    crossStoreRejected = true;
  }
  assert(crossStoreRejected, 'catalog item lookup under the wrong storeId must 404 (assertSupplierOwned)');
  console.log('[supplier-catalog-items-demo] OK — cross-store ownership check confirmed.');

  console.log('[supplier-catalog-items-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[supplier-catalog-items-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[supplier-catalog-items-demo] FAILED:', err);
  process.exit(1);
});
