/**
 * Runnable proof — boots the real Nest application context (real Postgres
 * via `inventory_db`) and drives `OrderSyncService.commitOrder`/`.releaseOrder`
 * directly with synthetic `orders.order.placed`/`.canceled` payloads —
 * order-service's real events don't need to physically exist for this
 * proof, same substitution marketing-service's own `order-sync-demo.ts`
 * uses for the same reason.
 *
 * Run:
 *   npm run inventory:order-sync-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app/app.module';
import { LocationsService } from '../app/locations/locations.service';
import { StockLevelsService } from '../app/stock-levels/stock-levels.service';
import { StockMovementsService } from '../app/stock-movements/stock-movements.service';
import { ReservationsService } from '../app/reservations/reservations.service';
import { OrderSyncService } from '../app/order-sync/order-sync.service';
import { StockLevel } from '../app/entities/stock-level.entity';
import { StockMovementKind } from '../app/entities/stock-movement.entity';
import { CatalogVariantSnapshot } from '../app/entities/catalog-variant-snapshot.entity';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[order-sync-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${Date.now()}`;

  const locations = app.get(LocationsService);
  const stockLevels = app.get(StockLevelsService);
  const stockMovements = app.get(StockMovementsService);
  const reservations = app.get(ReservationsService);
  const orderSync = app.get(OrderSyncService);
  const stockLevelRepo = app.get<Repository<StockLevel>>(getRepositoryToken(StockLevel));
  const variantSnapshotRepo = app.get<Repository<CatalogVariantSnapshot>>(
    getRepositoryToken(CatalogVariantSnapshot),
  );

  console.log('[order-sync-demo] setting up a stock level with 10 on hand...');
  const location = await locations.create(storeId, { name: 'Demo Warehouse' });
  const variantId = `variant_${Date.now()}`;
  // StockLevelsService.create() validates the variant against this
  // service's own catalog-sync read model (CatalogVariantSnapshot), not an
  // arbitrary string — normally populated by the real catalog.variant.created
  // consumer; inserted directly here since this demo has no real
  // catalog-service producing that event.
  await variantSnapshotRepo.save(
    variantSnapshotRepo.create({ id: variantId, storeId, productId: `product_${Date.now()}`, sku: 'DEMO-SKU-1' }),
  );
  const stockLevel = await stockLevels.create(storeId, { variantId, locationId: location.id });
  await stockMovements.record({
    storeId,
    stockLevelId: stockLevel.id,
    kind: StockMovementKind.PurchaseReceipt,
    qtyDelta: 10,
    refTable: 'demo',
    refId: 'seed',
  });

  console.log('[order-sync-demo] orders.order.placed commits a reservation (release + sale)...');
  {
    const reservation = await reservations.create(storeId, {
      stockLevelId: stockLevel.id,
      qty: 3,
      orderId: 'order_1',
      orderLineId: 'line_1',
    });
    let refreshed = await stockLevelRepo.findOneByOrFail({ id: stockLevel.id });
    assert(refreshed.reserved === 3, `expected reserved=3, got ${refreshed.reserved}`);
    assert(refreshed.onHand === 10, `expected on_hand still 10 before commit, got ${refreshed.onHand}`);

    await orderSync.commitOrder(storeId, {
      orderId: 'order_1',
      storeId,
      lines: [{ orderLineId: 'line_1', variantId, qty: 3, reservationId: reservation.id }],
    });

    refreshed = await stockLevelRepo.findOneByOrFail({ id: stockLevel.id });
    assert(refreshed.reserved === 0, `expected reserved=0 after commit, got ${refreshed.reserved}`);
    assert(refreshed.onHand === 7, `expected on_hand=7 after commit (10-3), got ${refreshed.onHand}`);
    console.log('[order-sync-demo] OK — reservation gone, on_hand decremented by the reserved qty.');

    console.log('[order-sync-demo] double delivery of placed is a no-op (idempotent commit)...');
    await orderSync.commitOrder(storeId, {
      orderId: 'order_1',
      storeId,
      lines: [{ orderLineId: 'line_1', variantId, qty: 3, reservationId: reservation.id }],
    });
    refreshed = await stockLevelRepo.findOneByOrFail({ id: stockLevel.id });
    assert(refreshed.onHand === 7, `expected on_hand to stay 7 after duplicate commit, got ${refreshed.onHand}`);
    assert(refreshed.reserved === 0, 'expected reserved to stay 0 after duplicate commit');
    console.log('[order-sync-demo] OK — no double-commit.');
  }

  console.log('[order-sync-demo] orders.order.canceled releases a reservation, on_hand untouched...');
  {
    const reservation = await reservations.create(storeId, {
      stockLevelId: stockLevel.id,
      qty: 2,
      orderId: 'order_2',
      orderLineId: 'line_2',
    });
    let refreshed = await stockLevelRepo.findOneByOrFail({ id: stockLevel.id });
    assert(refreshed.reserved === 2, `expected reserved=2, got ${refreshed.reserved}`);
    const onHandBefore = refreshed.onHand;

    await orderSync.releaseOrder(storeId, {
      orderId: 'order_2',
      storeId,
      lines: [{ orderLineId: 'line_2', variantId, reservationId: reservation.id }],
    });

    refreshed = await stockLevelRepo.findOneByOrFail({ id: stockLevel.id });
    assert(refreshed.reserved === 0, `expected reserved=0 after release, got ${refreshed.reserved}`);
    assert(
      refreshed.onHand === onHandBefore,
      `expected on_hand untouched by release, got ${refreshed.onHand} vs ${onHandBefore}`,
    );
    console.log('[order-sync-demo] OK — released, on_hand untouched.');

    console.log('[order-sync-demo] double delivery of canceled is a no-op (idempotent release)...');
    await orderSync.releaseOrder(storeId, {
      orderId: 'order_2',
      storeId,
      lines: [{ orderLineId: 'line_2', variantId, reservationId: reservation.id }],
    });
    refreshed = await stockLevelRepo.findOneByOrFail({ id: stockLevel.id });
    assert(refreshed.reserved === 0 && refreshed.onHand === onHandBefore, 'expected no change after duplicate release');
    console.log('[order-sync-demo] OK — no double-release.');
  }

  console.log('[order-sync-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[order-sync-demo] FAILED:', err);
  process.exit(1);
});
