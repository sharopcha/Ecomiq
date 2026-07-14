/**
 * Runnable proof — boots the real
 * Nest application context (real `AdsService`, Postgres via `marketing_db`)
 * and exercises CRUD plus the `AdPlatformPort` logging-stub publish call.
 *
 * Run:
 *   npm run marketing:ads-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app/app.module';
import { AdsService } from '../app/ads/ads.service';
import { CampaignsService } from '../app/campaigns/campaigns.service';
import { AdPlatform } from '../app/entities/ad.entity';
import { CampaignKind } from '../app/entities/campaign.entity';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ads-demo] ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${Date.now()}`;

  const ads = app.get(AdsService);
  const campaigns = app.get(CampaignsService);

  console.log('[ads-demo] creating a parent campaign...');
  const campaign = await campaigns.create(storeId, { kind: CampaignKind.Ads, title: 'Ads Demo Campaign' });

  console.log('[ads-demo] creating an ad (expect a logging-stub publish log line above)...');
  const ad = await ads.create(storeId, {
    campaignId: campaign.id,
    platform: AdPlatform.Meta,
    budgetMinor: 50_000,
    audience: { interests: ['gardening'] },
  });
  assert(ad.platform === AdPlatform.Meta, 'expected platform meta');
  assert(ad.budgetMinor === 50_000, `expected budgetMinor=50000, got ${ad.budgetMinor}`);
  const stats = ad.stats as { externalRef?: string } | null;
  assert(!!stats?.externalRef, 'expected the logging-stub publish to stash an externalRef in stats');
  assert(stats!.externalRef!.startsWith('stub_ad_'), `expected a stub externalRef, got ${stats?.externalRef}`);
  console.log(`[ads-demo] OK — created, published via the logging stub, externalRef=${stats?.externalRef}`);

  console.log('[ads-demo] updating the budget...');
  const updated = await ads.update(storeId, ad.id, { budgetMinor: 75_000 });
  assert(updated.budgetMinor === 75_000, `expected budgetMinor=75000, got ${updated.budgetMinor}`);
  console.log('[ads-demo] OK — updated.');

  console.log('[ads-demo] listing...');
  const list = await ads.findAll(storeId, { limit: 20 });
  assert(list.items.some((a) => a.id === ad.id), 'expected the created ad to appear in the list');
  console.log('[ads-demo] OK — listed.');

  console.log('[ads-demo] removing...');
  await ads.remove(storeId, ad.id);
  try {
    await ads.findOne(storeId, ad.id);
    throw new Error('expected findOne after remove to fail, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'NotFoundException', 'expected a NotFoundException');
    console.log('[ads-demo] OK — removed.');
  }

  console.log('[ads-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[ads-demo] FAILED:', err);
  process.exit(1);
});
