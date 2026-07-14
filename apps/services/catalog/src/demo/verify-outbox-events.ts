/**
 * End-to-end proof of the outbox pipeline, without needing a running
 * identity-service or a real JWT — boots catalog-service's own Nest
 * application context (no HTTP
 * listener), drives `ProductsService`/`ProductVariantsService` directly the
 * same way the controllers do, and waits for the outbox relay (already
 * running as part of `AppModule`, per PulsarModule.forRootAsync) to actually
 * publish everything to Pulsar. Run alongside `catalog:events:tail` in
 * another terminal to *see* each event arrive:
 *
 *   docker compose up -d postgres pulsar
 *   npm run catalog:events:tail          # terminal 1 — leave running
 *   npm run catalog:events:verify        # terminal 2
 *
 * Terminal 1 should print catalog.product.created, catalog.product.updated,
 * catalog.price.changed, catalog.variant.created, and catalog.product.archived
 * — five events from four service calls (update() emits both product.updated
 * and price.changed since the price actually changes).
 *
 * Uses a throwaway `storeId` — catalog has no FK to `store` (ADR-2,
 * database-per-service: store lives in identity_db), so this doesn't need a
 * real store to exist, only a well-formed id.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource, IsNull } from 'typeorm';
import { OutboxMessage } from '@temp-nx/typeorm';
import { AppModule } from '../app/app.module';
import { ProductsService } from '../app/products/products.service';
import { ProductVariantsService } from '../app/product-variants/product-variants.service';

async function waitForOutboxDrained(dataSource: DataSource, timeoutMs = 15_000): Promise<void> {
  const repo = dataSource.getRepository(OutboxMessage);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pending = await repo.count({ where: { processedAt: IsNull() } });
    if (pending === 0) return;
    console.log(`[verify] waiting on ${pending} unpublished outbox row(s)...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    'timed out waiting for the outbox relay to drain — is Pulsar reachable, and was ' +
      '`npm run pulsar:provision` (or pulsar:demo) run at least once against this Pulsar instance?',
  );
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const products = app.get(ProductsService);
  const variants = app.get(ProductVariantsService);
  const dataSource = app.get(DataSource);

  const storeId = process.env['VERIFY_STORE_ID'] ?? `verify-store-${Date.now()}`;
  console.log(`[verify] using storeId=${storeId}`);

  console.log('[verify] creating product (-> catalog.product.created)...');
  const product = await products.create(storeId, { name: 'Verify Event Product', price: 19.99 });
  console.log(`[verify] created product ${product.id}`);

  console.log('[verify] raising its price (-> catalog.product.updated + catalog.price.changed)...');
  await products.update(storeId, product.id, { price: 24.99 });

  console.log('[verify] creating a variant (-> catalog.variant.created)...');
  await variants.create(storeId, product.id, { optionValueIds: [] });

  console.log('[verify] archiving the product (-> catalog.product.archived)...');
  await products.remove(storeId, product.id);

  console.log('[verify] waiting for the outbox relay to publish everything to Pulsar...');
  await waitForOutboxDrained(dataSource);

  console.log(
    '[verify] OK — every outbox row is published (processed_at set). ' +
      'Check the catalog:events:tail terminal for 5 events.',
  );
  await app.close();
}

main().catch((err) => {
  console.error('[verify] FAILED:', err);
  process.exit(1);
});
