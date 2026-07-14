/**
 * Demo seed data for order-service: 2
 * draft orders referencing catalog/inventory's seeded variants. Mirrors
 * catalog/inventory's `src/demo/seed.ts` conventions (boots the real Nest
 * app context, `--store=` arg).
 *
 * order-service can't join inventory_db/catalog_db (ADR-2) to look up their
 * seeded variant ids itself, so this script accepts them as explicit CLI
 * args. Falls back
 * to clearly-fake placeholder ids if omitted: harmless for these 2 *draft*
 * orders specifically (order-service's own CRUD never validates variant
 * existence against inventory — only the checkout saga's real gRPC
 * ReserveStock call would, and neither seeded order is checked out), just
 * won't line up with a real inventory_db row for anyone cross-referencing
 * by id.
 *
 *   docker compose up -d postgres
 *   npm run catalog:seed
 *   npm run inventory:seed   # prints "variant ids (for order:seed): tee/S=... tee/M=... jacket=..."
 *   npm run order:seed -- --tee-variant=<tee/S id> --jacket-variant=<jacket id>
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app/app.module';
import { OrdersService } from '../app/orders/orders.service';
import { OrderStatus } from '../app/entities/order.entity';

function storeIdFromArgs(): string {
  const arg = process.argv.find((a) => a.startsWith('--store='));
  return arg ? arg.slice('--store='.length) : 'demo-store';
}

function argOrDefault(flag: string, fallback: string): string {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? arg.slice(`--${flag}=`.length) : fallback;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = storeIdFromArgs();
  const teeVariantId = argOrDefault('tee-variant', 'placeholder-variant-tee-s-blk');
  const jacketVariantId = argOrDefault('jacket-variant', 'placeholder-variant-wndbrk-default');
  console.log(`[seed] seeding order-service demo data for storeId=${storeId}`);
  if (teeVariantId.startsWith('placeholder-variant-')) {
    console.log(
      '[seed] using placeholder variant ids — pass --tee-variant=<id> --jacket-variant=<id> ' +
        '(printed by `npm run inventory:seed`) to reference real inventory_db rows.',
    );
  }

  const orders = app.get(OrdersService);

  console.log('[seed] draft order 1 (tee x2)...');
  const order1 = await orders.create(storeId, {
    status: OrderStatus.Draft,
    lines: [
      { variantId: teeVariantId, name: 'Classic Crew Tee', sku: 'TEE-S-BLK', qty: 2, unitPriceMinor: 2400 },
    ],
  });

  console.log('[seed] draft order 2 (tee + jacket)...');
  const order2 = await orders.create(storeId, {
    status: OrderStatus.Draft,
    lines: [
      { variantId: teeVariantId, name: 'Classic Crew Tee', sku: 'TEE-S-BLK', qty: 1, unitPriceMinor: 2400 },
      {
        variantId: jacketVariantId,
        name: 'Nimbus Windbreaker',
        sku: 'WNDBRK-DEFAULT',
        qty: 1,
        unitPriceMinor: 8900,
      },
    ],
  });

  console.log('[seed] done. Summary:');
  console.log(`[seed]   storeId:  ${storeId}`);
  console.log(
    `[seed]   orders:   ${order1.id} (#${order1.displayNumber}, tee x2), ${order2.id} (#${order2.displayNumber}, tee + jacket)`,
  );
  console.log(
    '[seed] fetch them via the gateway once order-service is up: ' +
      'GET /api/orders (needs a JWT for this storeId).',
  );

  await app.close();
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
