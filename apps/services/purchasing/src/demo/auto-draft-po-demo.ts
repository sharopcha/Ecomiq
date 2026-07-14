/**
 * Runnable proof — boots the real Nest application context (real
 * `SuppliersService`/`SupplierCatalogItemsService`/`PurchaseOrdersService`/
 * `AutoDraftPoService`, real Postgres via `purchasing_db`) and drives
 * `AutoDraftPoService.applyReorderTriggered` directly with synthetic
 * `inventory.reorder.triggered` payloads — inventory-service's real events
 * don't need to physically exist for this proof, same substitution
 * inventory's own `order-sync-demo.ts`/`purchasing-sync-demo.ts` use for
 * the same reason.
 *
 * Run:
 *   npm run purchasing:auto-draft-po-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { SuppliersService } from '../app/suppliers/suppliers.service';
import { SupplierCatalogItemsService } from '../app/supplier-catalog-items/supplier-catalog-items.service';
import { PurchaseOrdersService } from '../app/purchase-orders/purchase-orders.service';
import { AutoDraftPoService } from '../app/auto-draft-po/auto-draft-po.service';
import { PoStatus } from '../app/entities/purchase-order.entity';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[auto-draft-po-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const suppliers = app.get(SuppliersService);
  const catalogItems = app.get(SupplierCatalogItemsService);
  const purchaseOrders = app.get(PurchaseOrdersService);
  const autoDraft = app.get(AutoDraftPoService);

  const supplier = await suppliers.create(storeId, { name: 'Acme Textiles' });
  const variantId = `variant_${ulid()}`;
  const ruleId = `rule_${ulid()}`;

  console.log('[auto-draft-po-demo] non-purchase_order method is ignored...');
  await autoDraft.applyReorderTriggered(storeId, {
    stockLevelId: 'sl_1',
    variantId,
    locationId: 'loc_1',
    reorderRuleId: ruleId,
    triggerLevel: 5,
    reorderQty: 20,
    method: 'manual',
    preferredSupplierId: supplier.id,
    leadTimeDays: null,
    available: 2,
    onHand: 2,
    reserved: 0,
  });
  let list = await purchaseOrders.findAll(storeId, { limit: 10 } as never);
  assert(list.items.length === 0, 'method !== purchase_order must not create a PO');
  console.log('[auto-draft-po-demo] OK — non-purchase_order method ignored.');

  console.log('[auto-draft-po-demo] null preferredSupplierId is ack-and-logged...');
  await autoDraft.applyReorderTriggered(storeId, {
    stockLevelId: 'sl_1',
    variantId,
    locationId: 'loc_1',
    reorderRuleId: ruleId,
    triggerLevel: 5,
    reorderQty: 20,
    method: 'purchase_order',
    preferredSupplierId: null,
    leadTimeDays: null,
    available: 2,
    onHand: 2,
    reserved: 0,
  });
  list = await purchaseOrders.findAll(storeId, { limit: 10 } as never);
  assert(list.items.length === 0, 'null preferredSupplierId must not create a PO');
  console.log('[auto-draft-po-demo] OK — null preferredSupplierId ack-and-logged, no PO.');

  console.log('[auto-draft-po-demo] unknown supplierId is skip-and-logged...');
  await autoDraft.applyReorderTriggered(storeId, {
    stockLevelId: 'sl_1',
    variantId,
    locationId: 'loc_1',
    reorderRuleId: ruleId,
    triggerLevel: 5,
    reorderQty: 20,
    method: 'purchase_order',
    preferredSupplierId: 'unknown-supplier',
    leadTimeDays: null,
    available: 2,
    onHand: 2,
    reserved: 0,
  });
  list = await purchaseOrders.findAll(storeId, { limit: 10 } as never);
  assert(list.items.length === 0, 'unknown supplierId must not create a PO');
  console.log('[auto-draft-po-demo] OK — unknown supplierId skip-and-logged, no PO.');

  console.log('[auto-draft-po-demo] no matching catalog item -> unit cost 0 + flagged note...');
  await autoDraft.applyReorderTriggered(storeId, {
    stockLevelId: 'sl_1',
    variantId,
    locationId: 'loc_1',
    reorderRuleId: ruleId,
    triggerLevel: 5,
    reorderQty: 20,
    method: 'purchase_order',
    preferredSupplierId: supplier.id,
    leadTimeDays: 7,
    available: 2,
    onHand: 2,
    reserved: 0,
  });
  list = await purchaseOrders.findAll(storeId, { limit: 10 } as never);
  assert(list.items.length === 1, `expected 1 auto-drafted PO, got ${list.items.length}`);
  let draft = await purchaseOrders.findOne(storeId, list.items[0].id);
  assert(draft.status === PoStatus.Draft, 'auto-drafted PO should be draft');
  assert(draft.supplierId === supplier.id, 'auto-drafted PO should target the preferred supplier');
  assert(draft.deliverToLocationId === 'loc_1', 'auto-drafted PO should carry the trigger payload\'s locationId');
  assert(draft.lines?.[0]?.qty === 20, 'auto-drafted line qty should match reorderQty');
  assert(draft.lines?.[0]?.unitCostMinor === 0, 'no matching catalog item should default unit cost to 0');
  assert((draft.note ?? '').includes('unit cost defaulted to 0'), 'note should flag the unresolved cost for the merchant');
  console.log('[auto-draft-po-demo] OK — draft PO created with unit cost 0 and a flagged note.');

  console.log('[auto-draft-po-demo] re-trigger while a draft is already open is a no-op...');
  await autoDraft.applyReorderTriggered(storeId, {
    stockLevelId: 'sl_1',
    variantId,
    locationId: 'loc_1',
    reorderRuleId: ruleId,
    triggerLevel: 5,
    reorderQty: 20,
    method: 'purchase_order',
    preferredSupplierId: supplier.id,
    leadTimeDays: 7,
    available: 1,
    onHand: 1,
    reserved: 0,
  });
  list = await purchaseOrders.findAll(storeId, { limit: 10 } as never);
  assert(list.items.length === 1, `expected still exactly 1 PO after a re-trigger, got ${list.items.length}`);
  console.log('[auto-draft-po-demo] OK — dedup confirmed, no second PO while one is open.');

  console.log('[auto-draft-po-demo] once the open draft is canceled, a fresh trigger drafts again...');
  await purchaseOrders.cancel(storeId, draft.id);
  await catalogItems.create(storeId, supplier.id, {
    name: 'Cotton Twill Fabric',
    variantId,
    priceMinMinor: 450,
  } as never);
  await autoDraft.applyReorderTriggered(storeId, {
    stockLevelId: 'sl_1',
    variantId,
    locationId: 'loc_1',
    reorderRuleId: ruleId,
    triggerLevel: 5,
    reorderQty: 20,
    method: 'purchase_order',
    preferredSupplierId: supplier.id,
    leadTimeDays: 7,
    available: 1,
    onHand: 1,
    reserved: 0,
  });
  list = await purchaseOrders.findAll(storeId, { limit: 10 } as never);
  assert(list.items.length === 2, `expected 2 POs after the first is canceled, got ${list.items.length}`);
  const second = list.items.find((po) => po.id !== draft.id);
  draft = await purchaseOrders.findOne(storeId, (second as { id: string }).id);
  assert(draft.lines?.[0]?.unitCostMinor === 450, `expected unit cost 450 from the catalog item, got ${draft.lines?.[0]?.unitCostMinor}`);
  assert(!(draft.note ?? '').includes('defaulted to 0'), 'note should not flag a cost issue once a catalog item matched');
  console.log('[auto-draft-po-demo] OK — new auto-draft created with the matched catalog item\'s unit cost.');

  console.log('[auto-draft-po-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[auto-draft-po-demo] FAILED:', err);
  process.exit(1);
});
