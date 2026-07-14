/**
 * Demo seed data for shipping-service: 2 package presets, 2 labels (1
 * purchased), 3 shipments (draft / in_progress+delayed / arrived with a
 * full timeline), 1 fulfillment + tracking numbers, 2 pickups. Mirrors
 * catalog/inventory/order's own `src/demo/seed.ts` conventions (boots the
 * real Nest app context, `--store=` arg).
 *
 * Run:
 *   docker compose up -d postgres
 *   npm run shipping:seed [-- --store=<storeId>]
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { PackagePresetsService } from '../app/package-presets/package-presets.service';
import { LabelsService } from '../app/labels/labels.service';
import { ShipmentsService } from '../app/shipments/shipments.service';
import { FulfillmentsService } from '../app/fulfillments/fulfillments.service';
import { PickupsService } from '../app/pickups/pickups.service';
import { ShipmentStatus } from '../app/entities/shipment.entity';
import { ShipmentEventKind } from '../app/entities/shipment-event.entity';

function storeIdFromArgs(): string {
  const arg = process.argv.find((a) => a.startsWith('--store='));
  return arg ? arg.slice('--store='.length) : 'demo-store';
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = storeIdFromArgs();
  console.log(`[seed] seeding shipping-service demo data for storeId=${storeId}`);

  const packagePresets = app.get(PackagePresetsService);
  const labels = app.get(LabelsService);
  const shipments = app.get(ShipmentsService);
  const fulfillments = app.get(FulfillmentsService);
  const pickups = app.get(PickupsService);

  console.log('[seed] 2 package presets...');
  const smallBox = await packagePresets.create(storeId, {
    name: 'Small Box',
    packageType: 'box',
    weightKg: 0.5,
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10,
  });
  const largeBox = await packagePresets.create(storeId, {
    name: 'Large Box',
    packageType: 'box',
    weightKg: 2,
    lengthCm: 40,
    widthCm: 30,
    heightCm: 25,
  });

  console.log('[seed] 2 labels (1 purchased)...');
  const draftOrderId = `order_${ulid()}`;
  const draftLabel = await labels.create(storeId, {
    orderId: draftOrderId,
    carrier: 'ups',
    serviceType: 'ground',
    destinationAddress: { city: 'Chicago', postalCode: '60601', countryCode: 'US' },
    packages: [{ packagePresetId: smallBox.id }],
  });

  const purchasedOrderId = `order_${ulid()}`;
  const purchasedLabelDraft = await labels.create(storeId, {
    orderId: purchasedOrderId,
    carrier: 'fedex',
    serviceType: 'express',
    destinationAddress: { city: 'New York', postalCode: '10001', countryCode: 'US' },
    packages: [{ packagePresetId: largeBox.id }],
  });
  const purchasedLabel = await labels.purchase(storeId, purchasedLabelDraft.id);

  console.log('[seed] 3 shipments (draft / in_progress+delayed / arrived with timeline)...');
  const draftShipment = await shipments.create(storeId, {
    orderId: `order_${ulid()}`,
    contactEmail: 'draft-buyer@example.com',
    destinationAddress: { city: 'Chicago', postalCode: '60601' },
  });

  const delayedShipmentOrderId = `order_${ulid()}`;
  const delayedShipment = await shipments.create(storeId, {
    orderId: delayedShipmentOrderId,
    carrier: 'ups',
    contactEmail: 'delayed-buyer@example.com',
    destinationAddress: { city: 'Austin', postalCode: '73301' },
    expectedArrivalAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await shipments.transition(storeId, delayedShipment.id, ShipmentStatus.InProgress);
  await shipments.delay(storeId, delayedShipment.id, 'Weather delay at regional hub');

  const arrivedShipmentOrderId = `order_${ulid()}`;
  const arrivedShipment = await shipments.create(storeId, {
    orderId: arrivedShipmentOrderId,
    carrier: 'fedex',
    contactEmail: 'arrived-buyer@example.com',
    destinationAddress: { city: 'New York', postalCode: '10001' },
  });
  await shipments.transition(storeId, arrivedShipment.id, ShipmentStatus.InProgress);
  await shipments.addEvent(storeId, arrivedShipment.id, {
    kind: ShipmentEventKind.PickedUp,
    description: 'Picked up by carrier',
    location: 'Distribution Center, NJ',
  });
  await shipments.addEvent(storeId, arrivedShipment.id, {
    kind: ShipmentEventKind.InTransit,
    description: 'In transit',
    location: 'Newark, NJ',
  });
  await shipments.addEvent(storeId, arrivedShipment.id, {
    kind: ShipmentEventKind.OutForDelivery,
    description: 'Out for delivery',
    location: 'New York, NY',
  });
  await shipments.transition(storeId, arrivedShipment.id, ShipmentStatus.Arrived);

  console.log('[seed] 1 fulfillment + tracking numbers (linked to the arrived shipment)...');
  const fulfillment = await fulfillments.create(storeId, {
    orderId: arrivedShipmentOrderId,
    lines: [{ orderLineId: `line_${ulid()}`, qty: 2 }],
    trackingNumbers: [`TRK-${ulid()}`],
  });

  console.log('[seed] 2 pickups (for the draft + delayed shipments)...');
  const pickupDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await pickups.scheduleBulk(storeId, [
    { shipmentId: draftShipment.id, carrier: 'ups', pickupDate, pickupTime: '09:00', meridiem: 'AM' },
    { shipmentId: delayedShipment.id, carrier: 'ups', pickupDate, pickupTime: '02:00', meridiem: 'PM' },
  ]);

  console.log('[seed] done. Summary:');
  console.log(`[seed]   storeId:            ${storeId}`);
  console.log(`[seed]   package presets:    ${smallBox.id} (Small Box), ${largeBox.id} (Large Box)`);
  console.log(`[seed]   labels:             ${draftLabel.id} (draft), ${purchasedLabel.id} (purchased)`);
  console.log(
    `[seed]   shipments:          ${draftShipment.displayId} (draft), ${delayedShipment.displayId} (in_progress+delayed), ${arrivedShipment.displayId} (arrived, 4-entry timeline)`,
  );
  console.log(`[seed]   fulfillment:        ${fulfillment.id}`);
  console.log(
    '[seed] fetch them via the gateway once shipping-service is up: ' +
      'GET /api/shipping/shipments (needs a JWT for this storeId).',
  );

  await app.close();
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
