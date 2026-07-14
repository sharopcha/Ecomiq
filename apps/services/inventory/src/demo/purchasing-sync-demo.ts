/**
 * Runnable proof — boots the real Nest application context (real Postgres
 * via `inventory_db`) and drives `PurchasingSyncService.applyPoReceived`
 * directly with synthetic `purchasing.po.received` payloads —
 * purchasing-service's real events don't need to physically exist for this
 * proof, same substitution `order-sync-demo.ts` uses for
 * `orders.order.placed`/`.canceled`.
 *
 * Run:
 *   npm run inventory:purchasing-sync-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app/app.module';
import { LocationsService } from '../app/locations/locations.service';
import { PurchasingSyncService } from '../app/purchasing-sync/purchasing-sync.service';
import { StockLevel } from '../app/entities/stock-level.entity';
import { StockMovement } from '../app/entities/stock-movement.entity';
import { CatalogVariantSnapshot } from '../app/entities/catalog-variant-snapshot.entity';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[purchasing-sync-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${Date.now()}`;

  const locations = app.get(LocationsService);
  const purchasingSync = app.get(PurchasingSyncService);
  const stockLevelRepo = app.get<Repository<StockLevel>>(getRepositoryToken(StockLevel));
  const stockMovementRepo = app.get<Repository<StockMovement>>(getRepositoryToken(StockMovement));
  const variantSnapshotRepo = app.get<Repository<CatalogVariantSnapshot>>(
    getRepositoryToken(CatalogVariantSnapshot),
  );

  const location = await locations.create(storeId, { name: 'Demo Warehouse' });
  const variantId = `variant_${Date.now()}`;
  // Normally populated by the real catalog.variant.created consumer;
  // inserted directly here since this demo has no real catalog-service
  // producing that event — same substitution order-sync-demo.ts uses.
  await variantSnapshotRepo.save(
    variantSnapshotRepo.create({ id: variantId, storeId, productId: `product_${Date.now()}`, sku: 'DEMO-SKU-1' }),
  );

  const poId = `po_${Date.now()}`;

  console.log('[purchasing-sync-demo] first receipt of a brand-new variant creates stock_level...');
  await purchasingSync.applyPoReceived(storeId, {
    id: poId,
    storeId,
    deliverToLocationId: location.id,
    lines: [{ lineId: 'line_1', variantId, qty: 12, receivedQty: 12 }],
  });
  let stockLevel = await stockLevelRepo.findOneOrFail({ where: { storeId, variantId, location: { id: location.id } } });
  assert(stockLevel.onHand === 12, `expected on_hand 12, got ${stockLevel.onHand}`);
  console.log('[purchasing-sync-demo] OK — stock_level row created with on_hand 12.');

  console.log('[purchasing-sync-demo] a second partial receipt increments further...');
  await purchasingSync.applyPoReceived(storeId, {
    id: poId,
    storeId,
    deliverToLocationId: location.id,
    lines: [{ lineId: 'line_1', variantId, qty: 8, receivedQty: 20 }],
  });
  stockLevel = await stockLevelRepo.findOneOrFail({ where: { id: stockLevel.id } });
  assert(stockLevel.onHand === 20, `expected on_hand 20, got ${stockLevel.onHand}`);
  console.log('[purchasing-sync-demo] OK — on_hand incremented to 20.');

  console.log('[purchasing-sync-demo] replaying the exact same event is idempotent...');
  await purchasingSync.applyPoReceived(storeId, {
    id: poId,
    storeId,
    deliverToLocationId: location.id,
    lines: [{ lineId: 'line_1', variantId, qty: 8, receivedQty: 20 }],
  });
  stockLevel = await stockLevelRepo.findOneOrFail({ where: { id: stockLevel.id } });
  assert(stockLevel.onHand === 20, `expected on_hand to stay 20 after replay, got ${stockLevel.onHand}`);
  const movementCount = await stockMovementRepo.count({ where: { stockLevel: { id: stockLevel.id } } });
  assert(movementCount === 2, `expected exactly 2 movement rows (no duplicate from the replay), got ${movementCount}`);
  console.log('[purchasing-sync-demo] OK — no double-count, no duplicate movement row.');

  console.log('[purchasing-sync-demo] unknown variantId is skip-and-logged, not thrown...');
  await purchasingSync.applyPoReceived(storeId, {
    id: poId,
    storeId,
    deliverToLocationId: location.id,
    lines: [{ lineId: 'line_2', variantId: 'unknown-variant', qty: 5, receivedQty: 5 }],
  });
  console.log('[purchasing-sync-demo] OK — unknown variantId did not throw.');

  console.log('[purchasing-sync-demo] missing deliverToLocationId is skip-and-logged, not thrown...');
  await purchasingSync.applyPoReceived(storeId, {
    id: poId,
    storeId,
    deliverToLocationId: null,
    lines: [{ lineId: 'line_3', variantId, qty: 1, receivedQty: 21 }],
  });
  console.log('[purchasing-sync-demo] OK — missing deliverToLocationId did not throw.');

  console.log('[purchasing-sync-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[purchasing-sync-demo] FAILED:', err);
  process.exit(1);
});
