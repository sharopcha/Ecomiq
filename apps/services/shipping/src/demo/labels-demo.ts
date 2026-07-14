/**
 * Runnable proof — boots the real Nest application context (real
 * `PackagePresetsService`/`LabelsService`, real Postgres via `shipping_db`)
 * and exercises preset CRUD plus draft-label CRUD with packages, same
 * "boot the real app context, drive the real services" pattern as
 * notification's `templates-demo.ts`.
 *
 * Run:
 *   npm run shipping:labels-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { PackagePresetsService } from '../app/package-presets/package-presets.service';
import { LabelsService } from '../app/labels/labels.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const presets = app.get(PackagePresetsService);
  const labels = app.get(LabelsService);

  console.log('[labels-demo] package preset CRUD...');
  const preset = await presets.create(storeId, {
    name: 'Small Box',
    packageType: 'box',
    weightKg: 0.2,
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10,
  });
  assert(preset.id.length > 0, 'created preset should have an id');

  const presetList = await presets.findAll(storeId, { limit: 10 } as never);
  assert(presetList.items.some((p) => p.id === preset.id), 'findAll should include the created preset');

  const updatedPreset = await presets.update(storeId, preset.id, { name: 'Small Box (Updated)' });
  assert(updatedPreset.name === 'Small Box (Updated)', 'preset update should persist the new name');
  console.log('[labels-demo] OK — preset created, listed, updated.');

  console.log('[labels-demo] draft label create computes subtotal/total from the mock rate table...');
  const label = await labels.create(storeId, {
    orderId: `demo-order-${ulid()}`,
    carrier: 'usps',
    serviceType: 'Priority Mail',
    notifyCustomer: true,
    packages: [
      { packagePresetId: preset.id, packageName: 'Small Box', totalWeightKg: 1.5, combined: false },
      { packageName: 'Loose item', totalWeightKg: 0.5, combined: true },
    ],
  });
  assert(label.packages?.length === 2, 'created label should carry both packages');
  // usps: baseFee 500 + perKg 300 -> pkg1 = 500 + round(1.5*300)=450 -> 950; pkg2 = 500 + round(0.5*300)=150 -> 650; sum 1600
  assert(label.subtotalMinor === 1600, `unexpected subtotalMinor: ${label.subtotalMinor}`);
  assert(label.totalMinor === 1600, `unexpected totalMinor: ${label.totalMinor}`);
  assert(label.packages?.some((p) => p.combined === true), 'combine-package flag should round-trip');
  console.log('[labels-demo] OK — draft label created with computed totals and combine-package flag.');

  console.log('[labels-demo] findOne returns the label with its packages relation...');
  const fetched = await labels.findOne(storeId, label.id);
  assert(fetched.packages?.length === 2, 'findOne should eager-load packages');
  console.log('[labels-demo] OK.');

  console.log('[labels-demo] update replaces the package set and recomputes totals...');
  const updated = await labels.update(storeId, label.id, {
    carrier: 'fedex',
    packages: [{ packageName: 'Repacked', totalWeightKg: 2, combined: false }],
  });
  assert(updated.packages?.length === 1, 'update should replace the package set (1 row, not 3)');
  // fedex: baseFee 800 + perKg 450 -> 800 + round(2*450)=900 -> 1700
  assert(updated.totalMinor === 1700, `unexpected totalMinor after update: ${updated.totalMinor}`);
  console.log('[labels-demo] OK — replace-all packages + recomputed totals confirmed.');

  console.log('[labels-demo] listing + removing...');
  const labelList = await labels.findAll(storeId, { limit: 10 } as never);
  assert(labelList.items.some((l) => l.id === label.id), 'findAll should include the created label');

  await labels.remove(storeId, label.id);
  let removed = false;
  try {
    await labels.findOne(storeId, label.id);
  } catch {
    removed = true;
  }
  assert(removed, 'label should 404 after removal');
  console.log('[labels-demo] OK — remove confirmed (cascades to packages via ON DELETE CASCADE).');

  console.log('[labels-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[labels-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[labels-demo] FAILED:', err);
  process.exit(1);
});
