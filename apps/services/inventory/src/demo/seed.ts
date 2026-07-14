/**
 * Demo seed data for inventory-service, mirroring
 * apps/services/catalog/src/demo/seed.ts's shape and conventions (same
 * "boot the real Nest app context, drive the real services" pattern, same
 * idempotency policy: named/looked-up rows like locations are
 * find-or-create, everything else is cheap to create and just adds a fresh
 * set on a re-run rather than erroring).
 *
 * inventory-service can't join to catalog_db (ADR-2), and this script
 * doesn't require a running catalog-service or Pulsar broker either — it
 * populates the `CatalogProductSnapshot`/`CatalogVariantSnapshot` read-model
 * tables directly via `CatalogSyncService.upsertProduct`/`upsertVariant`,
 * the exact same idempotent-upsert code path
 * `CatalogSyncController`'s `@EventPattern` handlers call — just fed
 * fabricated payloads instead of ones that arrived over Pulsar. This is the
 * "known good starting state" for a from-scratch inventory_db, same
 * synchronize:true-instead-of-migrations situation as catalog.
 *
 *   docker compose up -d postgres
 *   npm run inventory:seed
 *   npm run inventory:seed -- --store=my-demo-store   # pin a specific storeId, e.g. to match catalog's seed
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { LocationsService } from '../app/locations/locations.service';
import { Location } from '../app/entities/location.entity';
import { CatalogSyncService } from '../app/catalog-sync/catalog-sync.service';
import { StockLevelsService } from '../app/stock-levels/stock-levels.service';
import { StockMovementsService } from '../app/stock-movements/stock-movements.service';
import { StockMovementKind } from '../app/entities/stock-movement.entity';
import { StockAuditsService } from '../app/stock-audits/stock-audits.service';
import { StockAdjustReason, StockAdjustType } from '../app/entities/stock-audit.entity';
import { StockAlertsService } from '../app/stock-alerts/stock-alerts.service';
import { AlertAction, AlertOperator } from '../app/entities/stock-alert.entity';
import { ReorderRulesService } from '../app/reorder-rules/reorder-rules.service';
import { ReorderMethod } from '../app/entities/reorder-rule.entity';
import { ReservationsService } from '../app/reservations/reservations.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

function storeIdFromArgs(): string {
  const arg = process.argv.find((a) => a.startsWith('--store='));
  return arg ? arg.slice('--store='.length) : 'demo-store';
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = storeIdFromArgs();
  console.log(`[seed] seeding inventory demo data for storeId=${storeId}`);

  const locationRepo = app.get<Repository<Location>>(getRepositoryToken(Location));
  const locations = app.get(LocationsService);
  const catalogSync = app.get(CatalogSyncService);
  const stockLevels = app.get(StockLevelsService);
  const stockMovements = app.get(StockMovementsService);
  const stockAudits = app.get(StockAuditsService);
  const stockAlerts = app.get(StockAlertsService);
  const reorderRules = app.get(ReorderRulesService);
  const reservations = app.get(ReservationsService);

  // ── Locations (find-or-create by name — same reasoning as catalog's
  // taxonomy rows: a handful of named, looked-up config rows, not something
  // that should duplicate on every re-run) ─────────────────────────────────
  console.log('[seed] locations...');
  const central =
    (await locationRepo.findOneBy({ storeId, name: 'Central Warehouse' })) ??
    (await locations.create(storeId, { name: 'Central Warehouse', isDefault: true }));
  const european =
    (await locationRepo.findOneBy({ storeId, name: 'European Warehouse' })) ??
    (await locations.create(storeId, { name: 'European Warehouse', city: 'Rotterdam' }));

  // ── Catalog variant snapshot (this service's own read-model, populated
  // the same way CatalogSyncController would from real catalog.product.*/variant.*
  // events — just with fabricated ids/payloads here instead of ones that
  // arrived over Pulsar). Fresh ids every run, same "products are cheap to
  // create" policy as catalog's own seed script. ───────────────────────────
  console.log('[seed] catalog variant snapshot (product + variants)...');
  const teeProductId = ulid();
  await catalogSync.upsertProduct(storeId, {
    productId: teeProductId,
    storeId,
    displayNumber: 1,
    name: 'Classic Crew Tee',
    status: 'active',
    kind: 'physical',
    sku: 'TEE',
    categoryId: ulid(),
    categoryName: 'Shirts',
    typeId: null,
    vendorId: null,
    priceMinor: 2400,
    compareAtMinor: 2900,
  });

  const teeVariantSmall = ulid();
  await catalogSync.upsertVariant(storeId, {
    productId: teeProductId,
    variantId: teeVariantSmall,
    sku: 'TEE-S-BLK',
    priceMinor: 2400,
    isActive: true,
    isDefault: true,
    imageFileId: 'demo/classic-crew-tee-front.jpg',
    optionValueIds: [],
  });

  const teeVariantMedium = ulid();
  await catalogSync.upsertVariant(storeId, {
    productId: teeProductId,
    variantId: teeVariantMedium,
    sku: 'TEE-M-BLK',
    priceMinor: 2400,
    isActive: true,
    isDefault: false,
    imageFileId: 'demo/classic-crew-tee-front.jpg',
    optionValueIds: [],
  });

  const jacketProductId = ulid();
  await catalogSync.upsertProduct(storeId, {
    productId: jacketProductId,
    storeId,
    displayNumber: 2,
    name: 'Nimbus Windbreaker',
    status: 'active',
    kind: 'physical',
    sku: 'WNDBRK',
    categoryId: ulid(),
    categoryName: 'Outerwear',
    typeId: null,
    vendorId: null,
    priceMinor: 8900,
    compareAtMinor: null,
  });

  const jacketVariant = ulid();
  await catalogSync.upsertVariant(storeId, {
    productId: jacketProductId,
    variantId: jacketVariant,
    sku: 'WNDBRK-DEFAULT',
    priceMinor: 8900,
    isActive: true,
    isDefault: true,
    imageFileId: 'demo/nimbus-windbreaker.jpg',
    optionValueIds: [],
  });

  // ── Stock levels + initial receipts (onHand is never settable
  // at creation; every unit arrives through a stock_movement, same as it
  // would from a real purchase_receipt). ───────────────────────────────────
  console.log('[seed] stock levels + initial purchase receipts...');
  const teeSmallCentral = await stockLevels.create(storeId, {
    variantId: teeVariantSmall,
    locationId: central.id,
    lowThreshold: 10,
    unitCost: 8.5,
  });
  await stockMovements.record({
    storeId,
    stockLevelId: teeSmallCentral.id,
    kind: StockMovementKind.PurchaseReceipt,
    qtyDelta: 50,
    refTable: 'seed',
  });

  const teeMediumCentral = await stockLevels.create(storeId, {
    variantId: teeVariantMedium,
    locationId: central.id,
    lowThreshold: 10,
    unitCost: 8.5,
  });
  await stockMovements.record({
    storeId,
    stockLevelId: teeMediumCentral.id,
    kind: StockMovementKind.PurchaseReceipt,
    qtyDelta: 6, // deliberately close to lowThreshold, to show the "Low" badge
    refTable: 'seed',
  });

  const teeSmallEuropean = await stockLevels.create(storeId, {
    variantId: teeVariantSmall,
    locationId: european.id,
    lowThreshold: 5,
    unitCost: 8.5,
  });
  await stockMovements.record({
    storeId,
    stockLevelId: teeSmallEuropean.id,
    kind: StockMovementKind.PurchaseReceipt,
    qtyDelta: 20,
    refTable: 'seed',
  });

  const jacketCentral = await stockLevels.create(storeId, {
    variantId: jacketVariant,
    locationId: central.id,
    lowThreshold: 8,
    unitCost: 32,
  });
  await stockMovements.record({
    storeId,
    stockLevelId: jacketCentral.id,
    kind: StockMovementKind.PurchaseReceipt,
    qtyDelta: 15,
    refTable: 'seed',
  });

  // ── Audit Stock — a physical count on the tee/M cell turns up 2
  // fewer than the system's on-hand, e.g. shrinkage. ─────────────────────
  console.log('[seed] stock audit...');
  await stockAudits.create(
    storeId,
    {
      stockLevelId: teeMediumCentral.id,
      adjustType: StockAdjustType.Quantity,
      physicalCount: 4,
      reason: StockAdjustReason.StocktakeVariance,
      note: 'Quarterly stocktake — 2 units unaccounted for.',
    },
    null, // no authenticated user in this seed context
  );

  // ── Stock alert — notify when the tee/M cell (already close to
  // its lowThreshold above) drops below 10 at Central specifically. ──────
  console.log('[seed] stock alert...');
  await stockAlerts.create(storeId, {
    variantId: teeVariantMedium,
    locationId: central.id,
    threshold: 10,
    direction: AlertOperator.LowerThan,
    actions: [AlertAction.SendEmail],
  });

  // ── Reorder rule — "Set Automatic Reorder" on the windbreaker,
  // across every warehouse (no locationId). `preferredSupplierId` is a made
  // -up opaque string — purchasing-service doesn't exist yet (see
  // ReorderRule's doc comment). ────────────────────────────────────────────
  console.log('[seed] reorder rule...');
  await reorderRules.create(storeId, {
    variantId: jacketVariant,
    method: ReorderMethod.PurchaseOrder,
    triggerLevel: 5,
    reorderQty: 25,
    preferredSupplierId: 'demo-supplier-nimbus',
    leadTimeDays: 14,
  });

  // ── Reservation — a live 24h hold against the tee/S/Central
  // cell, left active (not released) so the seed shows a real in-flight
  // "Reserve Item" example, same spirit as catalog seed's pre-reserved
  // license key. ──────────────────────────────────────────────────────────
  console.log('[seed] reservation...');
  const reservation = await reservations.create(storeId, {
    stockLevelId: teeSmallCentral.id,
    qty: 3,
    orderId: 'demo-order-1',
  });

  console.log('[seed] done. Summary:');
  console.log(`[seed]   storeId:            ${storeId}`);
  console.log(`[seed]   locations:          ${central.name}, ${european.name}`);
  console.log(`[seed]   products:           ${teeProductId} (2 variants), ${jacketProductId} (1 variant)`);
  // order:seed can't join inventory_db
  // (ADR-2) to look these up itself, so print them here for a human (or a
  // scripted `--tee-variant=$(...)` capture) to pass through explicitly.
  console.log(
    `[seed]   variant ids (for order:seed): tee/S=${teeVariantSmall} tee/M=${teeVariantMedium} jacket=${jacketVariant}`,
  );
  console.log(
    `[seed]   stock levels:       tee/S@Central=50, tee/M@Central=6 (Low), tee/S@European=20, jacket@Central=15`,
  );
  console.log('[seed]   stock audit:        tee/M@Central, stocktake_variance, discrepancy -2');
  console.log('[seed]   stock alert:        tee/M@Central, lower_than 10, send_email');
  console.log('[seed]   reorder rule:       jacket (all locations), trigger 5, reorder 25 from demo-supplier-nimbus');
  console.log(`[seed]   reservation:        ${reservation.id} — 3x tee/S@Central, active until ${reservation.reservedUntil.toISOString()}`);
  console.log(
    '[seed] fetch them via the gateway once inventory-service is up: ' +
      'GET /api/inventory/stock-levels (needs a JWT for this storeId).',
  );

  await app.close();
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
