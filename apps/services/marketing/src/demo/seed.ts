/**
 * Demo seed data for marketing-service: a discount in every
 * `DiscountStatus` plus a draft campaign. Mirrors catalog/inventory's
 * `src/demo/seed.ts` conventions (boots the real Nest app context,
 * `--store=` arg, cheap-to-create-so-a-rerun-just-adds-a-fresh-set policy —
 * discount codes are timestamped to stay unique per run since
 * `DiscountsService.create` enforces `UNIQUE(store_id, code)`).
 *
 * `expired` has no reachable transition through the real service (nothing
 * ages a discount past its `endsAt` automatically — that's a documented
 * §0 gap, unlike RMA/campaign expiry which do have real delayed-message
 * handlers) — set directly via the repository for this one case only,
 * with `endsAt` genuinely in the past so it's a believable expired row.
 *
 *   docker compose up -d postgres
 *   npm run marketing:seed
 *   npm run marketing:seed -- --store=my-demo-store   # pin a specific storeId
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app/app.module';
import { DiscountsService } from '../app/discounts/discounts.service';
import { CampaignsService } from '../app/campaigns/campaigns.service';
import { Discount, DiscountKind, DiscountStatus } from '../app/entities/discount.entity';
import { CampaignKind } from '../app/entities/campaign.entity';

function storeIdFromArgs(): string {
  const arg = process.argv.find((a) => a.startsWith('--store='));
  return arg ? arg.slice('--store='.length) : 'demo-store';
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = storeIdFromArgs();
  const suffix = Date.now();
  console.log(`[seed] seeding marketing demo data for storeId=${storeId}`);

  const discounts = app.get(DiscountsService);
  const campaigns = app.get(CampaignsService);
  const discountRepo = app.get<Repository<Discount>>(getRepositoryToken(Discount));

  console.log('[seed] discounts (one per status)...');
  const draft = await discounts.create(storeId, {
    code: `WELCOME-${suffix}`,
    kind: DiscountKind.Percentage,
    value: 1500,
  });

  const active = await discounts.create(storeId, {
    code: `SAVE10-${suffix}`,
    kind: DiscountKind.Percentage,
    value: 1000,
  });
  await discounts.activate(storeId, active.id);

  const expiredSeed = await discounts.create(storeId, {
    code: `SUMMER5-${suffix}`,
    kind: DiscountKind.FixedAmount,
    value: 500,
  });
  expiredSeed.status = DiscountStatus.Expired;
  expiredSeed.endsAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const expired = await discountRepo.save(expiredSeed);

  const archivable = await discounts.create(storeId, {
    code: `OLDPROMO-${suffix}`,
    kind: DiscountKind.FreeShipping,
    value: 0,
  });
  await discounts.activate(storeId, archivable.id);
  const archived = await discounts.archive(storeId, archivable.id);

  console.log('[seed] draft campaign...');
  const campaign = await campaigns.create(storeId, {
    kind: CampaignKind.Email,
    title: 'Welcome Series (seed)',
    audience: { emails: ['demo-recipient@example.com'] },
    contentRef: { subject: 'Welcome to the store!' },
  });

  console.log('[seed] done. Summary:');
  console.log(`[seed]   storeId:    ${storeId}`);
  console.log(
    `[seed]   discounts:  ${draft.code} (draft), ${active.code} (active), ${expired.code} (expired), ${archived.code} (archived)`,
  );
  console.log(`[seed]   campaign:   ${campaign.id} "${campaign.title}" (draft)`);
  console.log(
    '[seed] fetch them via the gateway once marketing-service is up: ' +
      'GET /api/marketing/discounts, GET /api/marketing/campaigns (needs a JWT for this storeId).',
  );

  await app.close();
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
