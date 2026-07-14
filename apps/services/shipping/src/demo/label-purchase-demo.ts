/**
 * Runnable proof — boots the real Nest application context (real
 * `LabelsService`, real `MockCarrierProvider` behind `CarrierProviderPort`,
 * real Postgres via `shipping_db`) and exercises the purchase flow: success
 * shape, the postal-99 deterministic failure trigger, and purchased-label
 * immutability. Same "boot the real app context, drive the real services"
 * pattern as `labels-demo.ts`.
 *
 * Run:
 *   npm run shipping:label-purchase-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { LabelsService } from '../app/labels/labels.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const labels = app.get(LabelsService);

  console.log('[label-purchase-demo] purchasing a label with a serviceable destination...');
  const label = await labels.create(storeId, {
    orderId: `demo-order-${ulid()}`,
    carrier: 'usps',
    destinationAddress: { postalCode: '10001', countryCode: 'US', city: 'New York' },
    packages: [{ packageName: 'Box', totalWeightKg: 1, combined: false }],
  });
  assert(label.purchasedAt == null, 'freshly created label should be a draft');

  const purchased = await labels.purchase(storeId, label.id);
  assert(purchased.purchasedAt != null, 'purchase should set purchasedAt');
  assert(typeof purchased.labelFileId === 'string' && purchased.labelFileId.length > 0, 'purchase should set labelFileId to the fabricated label URL');
  assert(purchased.totalMinor === 800, `unexpected totalMinor after purchase: ${purchased.totalMinor}`); // usps: 500 + round(1*300)
  console.log('[label-purchase-demo] OK — purchase succeeded, totals + labelFileId set.');

  console.log('[label-purchase-demo] postal code ending 99 triggers a deterministic purchase failure...');
  const failLabel = await labels.create(storeId, {
    orderId: `demo-order-${ulid()}`,
    carrier: 'fedex',
    destinationAddress: { postalCode: '90099', countryCode: 'US', city: 'Nowhere' },
    packages: [{ packageName: 'Box', totalWeightKg: 1, combined: false }],
  });
  let failedAsExpected = false;
  try {
    await labels.purchase(storeId, failLabel.id);
  } catch (err) {
    failedAsExpected = (err as { status?: number }).status === 422;
  }
  assert(failedAsExpected, 'purchase against a …99 postal code should reject with 422');
  const stillDraft = await labels.findOne(storeId, failLabel.id);
  assert(stillDraft.purchasedAt == null, 'a failed purchase should leave the label as a draft');
  console.log('[label-purchase-demo] OK — postal-99 trigger rejected the purchase, label stayed draft.');

  console.log('[label-purchase-demo] purchased labels are immutable...');
  let updateRejected = false;
  try {
    await labels.update(storeId, purchased.id, { carrier: 'ups' });
  } catch (err) {
    updateRejected = (err as { status?: number }).status === 409;
  }
  assert(updateRejected, 'updating a purchased label should reject with 409');

  let removeRejected = false;
  try {
    await labels.remove(storeId, purchased.id);
  } catch (err) {
    removeRejected = (err as { status?: number }).status === 409;
  }
  assert(removeRejected, 'removing a purchased label should reject with 409');

  let rePurchaseRejected = false;
  try {
    await labels.purchase(storeId, purchased.id);
  } catch (err) {
    rePurchaseRejected = (err as { status?: number }).status === 409;
  }
  assert(rePurchaseRejected, 're-purchasing an already-purchased label should reject with 409');
  console.log('[label-purchase-demo] OK — update/remove/re-purchase all rejected with 409.');

  console.log('[label-purchase-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[label-purchase-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[label-purchase-demo] FAILED:', err);
  process.exit(1);
});
