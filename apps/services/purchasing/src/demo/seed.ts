/**
 * Demo seed data for purchasing-service: 10 suppliers (mixed status/
 * featured/favorite, 3 registered with a portal password), catalog items,
 * reviews with a rating rollup, purchase orders spanning every `PoStatus`,
 * and one auto-draft PO chain taken all the way through
 * confirm/receive. Mirrors crm/marketing/inventory's `src/demo/seed.ts`
 * conventions (boots the real Nest app context, `--store=` arg,
 * timestamp-suffixed unique values so a rerun just adds a fresh set rather
 * than colliding on unique constraints like `(store_id, email)`).
 *
 *   docker compose up -d postgres redis pulsar
 *   npm run purchasing:seed
 *   npm run purchasing:seed -- --store=my-demo-store   # pin a specific storeId
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app/app.module';
import { SuppliersService } from '../app/suppliers/suppliers.service';
import { SupplierReviewsService } from '../app/supplier-reviews/supplier-reviews.service';
import { SupplierCatalogItemsService } from '../app/supplier-catalog-items/supplier-catalog-items.service';
import { PurchaseOrdersService } from '../app/purchase-orders/purchase-orders.service';
import { AutoDraftPoService } from '../app/auto-draft-po/auto-draft-po.service';
import { AuthService } from '../app/auth/auth.service';
import { PaymentTerms } from '../app/entities/purchase-order.entity';
import { ListPurchaseOrdersQueryDto } from '../app/purchase-orders/dto/list-purchase-orders-query.dto';

function storeIdFromArgs(): string {
  const arg = process.argv.find((a) => a.startsWith('--store='));
  return arg ? arg.slice('--store='.length) : 'demo-store';
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = storeIdFromArgs();
  const suffix = Date.now();
  console.log(`[seed] seeding purchasing demo data for storeId=${storeId}`);

  const suppliers = app.get(SuppliersService);
  const reviews = app.get(SupplierReviewsService);
  const catalogItems = app.get(SupplierCatalogItemsService);
  const purchaseOrders = app.get(PurchaseOrdersService);
  const autoDraftPo = app.get(AutoDraftPoService);
  const auth = app.get(AuthService);

  console.log('[seed] 10 suppliers (mixed status/featured/favorite)...');
  const created = [];
  for (let i = 0; i < 10; i++) {
    const supplier = await suppliers.create(storeId, {
      name: `Seed Supplier ${i + 1}`,
      email: `supplier${i}-${suffix}@example.com`,
      phone: '+1-555-0100',
      website: `https://supplier${i}.example.com`,
      city: 'Springfield',
      countryCode: 'US',
      shippingCarriers: ['ups', 'fedex'],
    });
    created.push(supplier);
    if (i % 4 === 1) {
      await suppliers.deactivate(storeId, supplier.id);
    }
    if (i % 3 === 0) {
      await suppliers.toggleFeature(storeId, supplier.id);
    }
    if (i % 5 === 0) {
      await suppliers.toggleFavorite(storeId, supplier.id);
    }
  }
  console.log(`[seed] OK — ${created.length} suppliers created.`);

  console.log('[seed] 3 suppliers register a portal login...');
  for (const supplier of created.slice(0, 3)) {
    await auth.register(storeId, {
      storeId,
      email: supplier.email!,
      password: 'seed-password-123',
    });
  }
  console.log('[seed] OK — 3 suppliers registered.');

  console.log('[seed] catalog items for the first 4 suppliers...');
  const primarySupplier = created[0];
  const primaryVariantId = `variant_seed_${suffix}`;
  const primaryCatalogItem = await catalogItems.create(storeId, primarySupplier.id, {
    name: 'Seed Widget (bulk case)',
    sku: `WID-${suffix}`,
    priceMinMinor: 1_200,
    priceMaxMinor: 1_500,
    minOrderQty: 24,
    variantId: primaryVariantId,
  });
  for (const supplier of created.slice(1, 4)) {
    await catalogItems.create(storeId, supplier.id, {
      name: 'Seed Accessory Pack',
      sku: `ACC-${supplier.id.slice(-6)}`,
      priceMinMinor: 400,
      priceMaxMinor: 600,
      minOrderQty: 10,
    });
  }
  console.log(`[seed] OK — catalog items seeded, primary item ${primaryCatalogItem.id} keyed to variant ${primaryVariantId}.`);

  console.log('[seed] reviews on the first 2 suppliers (rating_avg/rating_count rollup)...');
  await reviews.create(storeId, created[0].id, { rating: 5, title: 'Reliable', body: 'Always on time.' });
  await reviews.create(storeId, created[0].id, { rating: 4, title: 'Good', body: 'Minor delay once.' });
  await reviews.create(storeId, created[1].id, { rating: 3, title: 'Average', body: 'Nothing special.' });
  const rolledUpSupplier = await suppliers.findOne(storeId, created[0].id);
  console.log(
    `[seed] OK — supplier ${created[0].id} rating_avg=${rolledUpSupplier.ratingAvg} rating_count=${rolledUpSupplier.ratingCount}.`,
  );

  console.log('[seed] purchase orders spanning every status...');

  const draftPo = await purchaseOrders.create(storeId, {
    supplierId: created[2].id,
    paymentTerms: PaymentTerms.Net30,
    lines: [{ description: 'Draft line item', qty: 5, unitCostMinor: 1_000 }],
  });

  const sentPo = await purchaseOrders.create(storeId, {
    supplierId: created[3].id,
    paymentTerms: PaymentTerms.Net30,
    emailTo: created[3].email!,
    lines: [{ description: 'Sent line item', qty: 10, unitCostMinor: 800 }],
  });
  await purchaseOrders.send(storeId, sentPo.id);

  const confirmedPo = await purchaseOrders.create(storeId, {
    supplierId: created[4].id,
    paymentTerms: PaymentTerms.Cod,
    emailTo: created[4].email!,
    lines: [{ description: 'Confirmed line item', qty: 6, unitCostMinor: 1_500 }],
  });
  await purchaseOrders.send(storeId, confirmedPo.id);
  await purchaseOrders.confirm(storeId, confirmedPo.id);

  const partiallyReceivedPo = await purchaseOrders.create(storeId, {
    supplierId: created[5].id,
    paymentTerms: PaymentTerms.Net15,
    emailTo: created[5].email!,
    lines: [{ description: 'Partial receive line item', qty: 20, unitCostMinor: 300 }],
  });
  await purchaseOrders.send(storeId, partiallyReceivedPo.id);
  await purchaseOrders.confirm(storeId, partiallyReceivedPo.id);
  const partiallyReceivedDetail = await purchaseOrders.findOne(storeId, partiallyReceivedPo.id);
  await purchaseOrders.receive(storeId, partiallyReceivedPo.id, {
    lines: [{ lineId: partiallyReceivedDetail.lines![0].id, qty: 8 }],
  });

  const receivedPo = await purchaseOrders.create(storeId, {
    supplierId: created[6].id,
    paymentTerms: PaymentTerms.Prepaid,
    emailTo: created[6].email!,
    lines: [{ description: 'Fully received line item', qty: 4, unitCostMinor: 2_000 }],
  });
  await purchaseOrders.send(storeId, receivedPo.id);
  const receivedDetail = await purchaseOrders.findOne(storeId, receivedPo.id);
  await purchaseOrders.receive(storeId, receivedPo.id, {
    lines: [{ lineId: receivedDetail.lines![0].id, qty: 4 }],
  });

  const canceledPo = await purchaseOrders.create(storeId, {
    supplierId: created[7].id,
    paymentTerms: PaymentTerms.Net60,
    lines: [{ description: 'Canceled line item', qty: 2, unitCostMinor: 500 }],
  });
  await purchaseOrders.cancel(storeId, canceledPo.id);

  console.log(
    `[seed] OK — POs: draft=${draftPo.displayId}, sent=${sentPo.displayId}, confirmed=${confirmedPo.displayId}, ` +
      `partially_received=${partiallyReceivedPo.displayId}, received=${receivedPo.displayId}, canceled=${canceledPo.displayId}.`,
  );

  console.log('[seed] one completed auto-draft PO chain (reorder-triggered -> draft -> confirm -> receive)...');
  const reorderRuleId = `seed-rule-${suffix}`;
  await autoDraftPo.applyReorderTriggered(storeId, {
    stockLevelId: `seed-stock-${suffix}`,
    variantId: primaryVariantId,
    locationId: `seed-location-${suffix}`,
    reorderRuleId,
    triggerLevel: 10,
    reorderQty: 48,
    method: 'purchase_order',
    preferredSupplierId: primarySupplier.id,
    leadTimeDays: 7,
    available: 5,
    onHand: 5,
    reserved: 0,
  });
  const listQuery: ListPurchaseOrdersQueryDto = { supplierId: primarySupplier.id, limit: 50 };
  const autoDraftedPo = (await purchaseOrders.findAll(storeId, listQuery)).items.find(
    (po) => po.sourceReorderRuleId === reorderRuleId,
  );
  if (!autoDraftedPo) {
    throw new Error('[seed] auto-drafted PO was not found after applyReorderTriggered');
  }
  await purchaseOrders.update(storeId, autoDraftedPo.id, { emailTo: primarySupplier.email! });
  await purchaseOrders.send(storeId, autoDraftedPo.id);
  await purchaseOrders.confirm(storeId, autoDraftedPo.id);
  const autoDraftedDetail = await purchaseOrders.findOne(storeId, autoDraftedPo.id);
  const completedAutoDraft = await purchaseOrders.receive(storeId, autoDraftedPo.id, {
    lines: [{ lineId: autoDraftedDetail.lines![0].id, qty: 48 }],
  });
  console.log(
    `[seed] OK — auto-drafted PO ${completedAutoDraft.displayId} from reorder rule ${reorderRuleId}, ` +
      `now status=${completedAutoDraft.status}.`,
  );

  console.log('[seed] done. Summary:');
  console.log(`[seed]   storeId:          ${storeId}`);
  console.log(`[seed]   suppliers:        ${created.length} total (3 registered)`);
  console.log(`[seed]   catalog items:    4 suppliers stocked, primary variant ${primaryVariantId}`);
  console.log(`[seed]   reviews:          3, rolled up onto 2 suppliers`);
  console.log(`[seed]   purchase orders:  6 manual (one per status) + 1 completed auto-draft chain`);
  console.log(
    '[seed] fetch them via the gateway once purchasing-service is up: ' +
      'GET /api/purchasing/suppliers, GET /api/purchasing/pos (needs a JWT for this storeId).',
  );

  // A short grace period before closing: the outbox relay polls in the
  // background (see AppModule) — closing immediately after the last insert
  // can race its in-flight tick, producing harmless but noisy
  // "AlreadyClosed" warnings as Pulsar/Postgres connections tear down
  // mid-publish. All seed data is already committed by this point
  // regardless; this just lets the relay's last batch flush quietly.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await app.close();
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
