/**
 * Demo seed data (includes a bundle + license keys). No migrations in this
 * project (local dev relies on `synchronize: true` in
 * catalogDataSourceOptions), so this is the only
 * "known good starting state" for catalog_db: a handful of vendors,
 * a small category tree, product types/channels/tags, a few products
 * with options/variants/images, a bundle spanning two of them, and a batch
 * of license keys (one pre-reserved) for the digital gift card — all under
 * one demo store.
 *
 * Boots catalog-service's own Nest application context (no HTTP listener),
 * driving the real services the same way the controllers do — same pattern
 * as verify-outbox-events.ts. Safe to re-run: every lookup is
 * find-or-create by name within the store, so re-running just no-ops on
 * anything that already exists (except products, which are cheap to create
 * and identified by display_number rather than name, so a re-run adds a
 * fresh set rather than erroring).
 *
 *   docker compose up -d postgres
 *   npm run catalog:seed
 *   npm run catalog:seed -- --store=my-demo-store   # pin a specific storeId
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { AppModule } from '../app/app.module';
import { Vendor } from '../app/entities/vendor.entity';
import { Category } from '../app/entities/category.entity';
import { ProductType } from '../app/entities/product-type.entity';
import { Channel, OrderChannelType } from '../app/entities/channel.entity';
import { Tag } from '../app/entities/tag.entity';
import { ProductKind, ProductStatus } from '../app/entities/product.entity';
import { ProductsService } from '../app/products/products.service';
import { ProductOptionsService } from '../app/product-options/product-options.service';
import { ProductVariantsService } from '../app/product-variants/product-variants.service';
import { ProductImagesService } from '../app/product-images/product-images.service';
import { BundlesService } from '../app/bundles/bundles.service';
import { LicenseKeysService } from '../app/license-keys/license-keys.service';

function storeIdFromArgs(): string {
  const arg = process.argv.find((a) => a.startsWith('--store='));
  return arg ? arg.slice('--store='.length) : 'demo-store';
}

/** Find an existing row by name within the store, or create it — keeps the script idempotent for taxonomy. */
async function findOrCreate<T extends { id: string; storeId: string; name: string }>(
  repo: Repository<T>,
  storeId: string,
  name: string,
  extra: Partial<T> = {},
): Promise<T> {
  const existing = await repo.findOneBy({ storeId, name } as never);
  if (existing) return existing;
  const entity = repo.create({ storeId, name, ...extra } as unknown as DeepPartial<T>);
  return repo.save(entity);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = storeIdFromArgs();
  console.log(`[seed] seeding catalog demo data for storeId=${storeId}`);

  const vendorRepo = app.get<Repository<Vendor>>(getRepositoryToken(Vendor));
  const categoryRepo = app.get<Repository<Category>>(getRepositoryToken(Category));
  const typeRepo = app.get<Repository<ProductType>>(getRepositoryToken(ProductType));
  const channelRepo = app.get<Repository<Channel>>(getRepositoryToken(Channel));
  const tagRepo = app.get<Repository<Tag>>(getRepositoryToken(Tag));

  const products = app.get(ProductsService);
  const options = app.get(ProductOptionsService);
  const variants = app.get(ProductVariantsService);
  const images = app.get(ProductImagesService);
  const bundles = app.get(BundlesService);
  const licenseKeys = app.get(LicenseKeysService);

  // ── Taxonomy ────────────────────────────────────────────────────────────
  console.log('[seed] taxonomy: vendors, categories, product types, channels, tags...');
  const vendorAurora = await findOrCreate(vendorRepo, storeId, 'Aurora Goods');
  const vendorNimbus = await findOrCreate(vendorRepo, storeId, 'Nimbus Supply Co.');

  const apparel = await findOrCreate(categoryRepo, storeId, 'Apparel');
  const shirts = await findOrCreate(categoryRepo, storeId, 'Shirts', { parent: apparel });
  const outerwear = await findOrCreate(categoryRepo, storeId, 'Outerwear', { parent: apparel });
  const accessories = await findOrCreate(categoryRepo, storeId, 'Accessories');

  const typePhysicalGood = await findOrCreate(typeRepo, storeId, 'Physical Good');
  const typeDigitalDownload = await findOrCreate(typeRepo, storeId, 'Digital Download');

  const channelOnline = await findOrCreate(channelRepo, storeId, 'Online Store', {
    kind: OrderChannelType.OnlineStore,
  });
  const channelPos = await findOrCreate(channelRepo, storeId, 'Retail POS', {
    kind: OrderChannelType.Pos,
  });

  const tagNewArrival = await findOrCreate(tagRepo, storeId, 'new-arrival');
  const tagBestSeller = await findOrCreate(tagRepo, storeId, 'best-seller');

  // ── Products ────────────────────────────────────────────────────────────
  console.log('[seed] products...');

  const tee = await products.create(storeId, {
    name: 'Classic Crew Tee',
    description: 'A soft, everyday cotton crew-neck tee.',
    status: ProductStatus.Active,
    kind: ProductKind.Physical,
    sku: 'TEE',
    categoryId: shirts.id,
    typeId: typePhysicalGood.id,
    vendorId: vendorAurora.id,
    price: 24.0,
    compareAtPrice: 29.0,
    cost: 8.5,
    channelIds: [channelOnline.id, channelPos.id],
    tagIds: [tagNewArrival.id, tagBestSeller.id],
  });

  await options.create(storeId, tee.id, {
    name: 'Size',
    position: 0,
    values: [{ value: 'S' }, { value: 'M' }, { value: 'L' }, { value: 'XL' }],
  });
  await options.create(storeId, tee.id, {
    name: 'Color',
    position: 1,
    values: [{ value: 'Black' }, { value: 'Heather Gray' }],
  });

  const matrixResult = await variants.generateMatrix(storeId, tee.id);
  console.log(
    `[seed]   ${tee.name}: generated ${matrixResult.created.length} variant(s), skipped ${matrixResult.skipped}`,
  );

  await images.attach(storeId, tee.id, { fileId: 'demo/classic-crew-tee-front.jpg' });
  await images.attach(storeId, tee.id, { fileId: 'demo/classic-crew-tee-back.jpg' });

  const jacket = await products.create(storeId, {
    name: 'Nimbus Windbreaker',
    description: 'Lightweight, packable windbreaker for shoulder-season weather.',
    status: ProductStatus.Active,
    kind: ProductKind.Physical,
    sku: 'WNDBRK',
    categoryId: outerwear.id,
    typeId: typePhysicalGood.id,
    vendorId: vendorNimbus.id,
    price: 89.0,
    cost: 32.0,
    channelIds: [channelOnline.id],
    tagIds: [tagNewArrival.id],
  });
  await images.attach(storeId, jacket.id, { fileId: 'demo/nimbus-windbreaker.jpg' });
  // No options -> a single default variant.
  const jacketMatrix = await variants.generateMatrix(storeId, jacket.id);

  const giftCard = await products.create(storeId, {
    name: '$50 Digital Gift Card',
    description: 'Delivered by email — redeemable storewide.',
    status: ProductStatus.Active,
    kind: ProductKind.Digital,
    sku: 'GIFT50',
    categoryId: accessories.id,
    typeId: typeDigitalDownload.id,
    price: 50.0,
    channelIds: [channelOnline.id],
  });
  await variants.generateMatrix(storeId, giftCard.id);

  // ── License keys — a batch for the digital gift card, plus one reserved
  // right away so the seed shows both an Available and an Assigned key
  // rather than just an untouched pool. ────────────────────────────────
  console.log('[seed] license keys...');
  await licenseKeys.addMany(storeId, giftCard.id, {
    keyValues: ['GIFT50-DEMO-0001', 'GIFT50-DEMO-0002', 'GIFT50-DEMO-0003'],
  });
  await licenseKeys.reserveNext(storeId, giftCard.id, { orderLineId: 'demo-order-line-1' });

  // ── Bundle — pairs the tee's first generated variant with the jacket's
  // single default variant at a discount off their combined price. ──────
  console.log('[seed] bundle...');
  const teeVariantForBundle = matrixResult.created[0];
  const jacketVariant = jacketMatrix.created[0];
  if (teeVariantForBundle && jacketVariant) {
    await bundles.create(storeId, {
      name: 'Tee + Windbreaker Starter Kit',
      price: 99.0,
      items: [
        { variantId: teeVariantForBundle.id, qty: 1 },
        { variantId: jacketVariant.id, qty: 1 },
      ],
    });
  }

  const draftHoodie = await products.create(storeId, {
    name: 'Aurora Fleece Hoodie',
    description: 'Not yet published — pricing still being finalized.',
    status: ProductStatus.Draft,
    kind: ProductKind.Physical,
    sku: 'HOODIE',
    categoryId: outerwear.id,
    vendorId: vendorAurora.id,
    price: 65.0,
  });
  await variants.generateMatrix(storeId, draftHoodie.id);

  console.log('[seed] done. Summary:');
  console.log(`[seed]   storeId:        ${storeId}`);
  console.log(`[seed]   vendors:        ${vendorAurora.name}, ${vendorNimbus.name}`);
  console.log(
    `[seed]   categories:     ${apparel.name} > (${shirts.name}, ${outerwear.name}), ${accessories.name}`,
  );
  console.log(`[seed]   products:       ${tee.id}, ${jacket.id}, ${giftCard.id}, ${draftHoodie.id}`);
  console.log('[seed]   license keys:   3 added for the gift card, 1 already reserved');
  console.log('[seed]   bundle:         Tee + Windbreaker Starter Kit (if both variants were generated)');
  console.log(
    '[seed] fetch them via the gateway once catalog-service is up: ' +
      'GET /api/catalog/products (needs a JWT for this storeId).',
  );

  await app.close();
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
