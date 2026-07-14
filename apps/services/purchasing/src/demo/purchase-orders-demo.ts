/**
 * Runnable proof — boots the real Nest application context (real
 * `SuppliersService`/`PurchaseOrdersService`, real Postgres via
 * `purchasing_db`) and exercises PO CRUD, totals computation, send, and the
 * confirm/cancel status machine, same "boot the real app context, drive
 * the real services" pattern as crm's `customers-demo.ts`.
 *
 * Run:
 *   npm run purchasing:purchase-orders-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { SuppliersService } from '../app/suppliers/suppliers.service';
import { PurchaseOrdersService } from '../app/purchase-orders/purchase-orders.service';
import { PoStatus } from '../app/entities/purchase-order.entity';
import { OutboxMessage } from '@temp-nx/typeorm';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const suppliers = app.get(SuppliersService);
  const purchaseOrders = app.get(PurchaseOrdersService);
  const dataSource = app.get(DataSource);

  console.log('[purchase-orders-demo] PO CRUD + totals...');
  const supplier = await suppliers.create(storeId, { name: 'Acme Textiles' });

  const po = await purchaseOrders.create(storeId, {
    supplierId: supplier.id,
    taxRate: 10,
    emailTo: 'orders@acme-textiles.example',
    emailSubject: 'New purchase order',
    lines: [
      { description: 'Cotton Twill Fabric', qty: 10, unitCostMinor: 500 },
      { description: 'Linen Blend', qty: 5, unitCostMinor: 900 },
    ],
  } as never);
  assert(po.displayId === 'PO-1', `expected first PO to be PO-1, got ${po.displayId}`);
  assert(po.status === PoStatus.Draft, 'new PO should default to draft status');
  // subtotal = 10*500 + 5*900 = 5000 + 4500 = 9500; tax 10% = 950; total = 10450.
  assert(po.subtotalMinor === 9500, `expected subtotalMinor 9500, got ${po.subtotalMinor}`);
  assert(po.totalMinor === 10450, `expected totalMinor 10450, got ${po.totalMinor}`);
  assert(po.lines?.length === 2, `expected 2 lines, got ${po.lines?.length}`);
  console.log('[purchase-orders-demo] OK — PO-<n> sequence + server-computed totals.');

  const second = await purchaseOrders.create(storeId, {
    supplierId: supplier.id,
    lines: [{ description: 'Wool Fabric', qty: 1, unitCostMinor: 1000 }],
  } as never);
  assert(second.displayId === 'PO-2', `expected sequence to increment, got ${second.displayId}`);
  assert(second.totalMinor === 1000, 'PO with no taxRate should have totalMinor === subtotalMinor');

  const fetched = await purchaseOrders.findOne(storeId, po.id);
  assert(fetched.lines?.length === 2, 'findOne should eager-load lines');

  const updated = await purchaseOrders.update(storeId, po.id, {
    taxRate: 20,
    lines: [{ description: 'Cotton Twill Fabric (revised)', qty: 20, unitCostMinor: 500 }],
  } as never);
  // subtotal = 20*500 = 10000; tax 20% = 2000; total = 12000.
  assert(updated.subtotalMinor === 10000, `expected recomputed subtotalMinor 10000, got ${updated.subtotalMinor}`);
  assert(updated.totalMinor === 12000, `expected recomputed totalMinor 12000, got ${updated.totalMinor}`);
  assert(updated.lines?.length === 1, 'update with lines should replace-all, leaving exactly 1 line');
  console.log('[purchase-orders-demo] OK — update recomputes totals and replaces lines wholesale.');

  const list = await purchaseOrders.findAll(storeId, { limit: 10 } as never);
  assert(list.items.length === 2, `expected 2 POs, got ${list.items.length}`);
  const draftOnly = await purchaseOrders.findAll(storeId, { limit: 10, status: PoStatus.Draft } as never);
  assert(draftOnly.items.length === 2, 'both POs should still be draft');
  console.log('[purchase-orders-demo] OK — list + status filter.');

  console.log('[purchase-orders-demo] status machine...');
  let confirmDraftRejected = false;
  try {
    await purchaseOrders.confirm(storeId, po.id);
  } catch {
    confirmDraftRejected = true;
  }
  assert(confirmDraftRejected, 'confirm() must refuse a draft PO — send() is what reaches "sent"');

  let sendWithoutEmailRejected = false;
  try {
    await purchaseOrders.send(storeId, second.id);
  } catch {
    sendWithoutEmailRejected = true;
  }
  assert(sendWithoutEmailRejected, 'send() must refuse a PO with no recipient email set');

  const sent = await purchaseOrders.send(storeId, po.id);
  assert(sent.status === PoStatus.Sent, `expected sent status, got ${sent.status}`);
  assert(sent.sentAt != null, 'send() should stamp sentAt');

  const outboxRepo = dataSource.getRepository(OutboxMessage);
  const notifyCommand = await outboxRepo.findOne({
    where: { storeId, eventType: 'notify.send' },
    order: { createdAt: 'DESC' },
  });
  assert(notifyCommand != null, 'send() should record a notify.send outbox command');
  assert(
    (notifyCommand?.payload as Record<string, unknown>)?.['template'] === 'purchase_order',
    'notify.send payload should carry template "purchase_order"',
  );
  console.log('[purchase-orders-demo] OK — send() stamps sentAt, refuses without email, records notify.send.');

  const confirmed = await purchaseOrders.confirm(storeId, po.id);
  assert(confirmed.status === PoStatus.Confirmed, `expected confirmed status, got ${confirmed.status}`);
  console.log('[purchase-orders-demo] OK — confirm() transitions sent -> confirmed.');

  console.log('[purchase-orders-demo] receiving...');
  const poLineId = confirmed.lines?.[0]?.id as string;
  // po's single line after update() is qty 20 (see the recomputed-totals
  // assertion above).
  let overReceiptRejected = false;
  try {
    await purchaseOrders.receive(storeId, po.id, { lines: [{ lineId: poLineId, qty: 21 }] } as never);
  } catch {
    overReceiptRejected = true;
  }
  assert(overReceiptRejected, 'receive() must reject a qty that would exceed the line\'s ordered qty');

  const partiallyReceived = await purchaseOrders.receive(storeId, po.id, {
    lines: [{ lineId: poLineId, qty: 12 }],
  } as never);
  assert(
    partiallyReceived.status === PoStatus.PartiallyReceived,
    `expected partially_received, got ${partiallyReceived.status}`,
  );
  assert(
    partiallyReceived.lines?.[0]?.receivedQty === 12,
    `expected receivedQty 12, got ${partiallyReceived.lines?.[0]?.receivedQty}`,
  );
  console.log('[purchase-orders-demo] OK — first receive() sets partially_received.');

  const fullyReceived = await purchaseOrders.receive(storeId, po.id, {
    lines: [{ lineId: poLineId, qty: 8 }],
  } as never);
  assert(fullyReceived.status === PoStatus.Received, `expected received, got ${fullyReceived.status}`);
  assert(
    fullyReceived.lines?.[0]?.receivedQty === 20,
    `expected receivedQty 20, got ${fullyReceived.lines?.[0]?.receivedQty}`,
  );
  console.log('[purchase-orders-demo] OK — second receive() completes the line and sets received.');

  const notifyRepo = dataSource.getRepository(OutboxMessage);
  const receivedEvent = await notifyRepo.findOne({
    where: { storeId, eventType: 'purchasing.po.received' },
    order: { createdAt: 'DESC' },
  });
  assert(receivedEvent != null, 'receive() should record a purchasing.po.received outbox event');
  const receivedPayload = receivedEvent?.payload as { lines: Array<{ qty: number }> };
  assert(
    receivedPayload.lines.length === 1 && receivedPayload.lines[0].qty === 8,
    'purchasing.po.received payload should carry only this call\'s received lines/qty, not the cumulative total',
  );
  console.log('[purchase-orders-demo] OK — purchasing.po.received payload carries per-call lines, not cumulative.');

  let receiveAfterReceivedRejected = false;
  try {
    await purchaseOrders.receive(storeId, po.id, { lines: [{ lineId: poLineId, qty: 1 }] } as never);
  } catch {
    receiveAfterReceivedRejected = true;
  }
  assert(receiveAfterReceivedRejected, 'receive() must refuse a PO that is already fully received');
  console.log('[purchase-orders-demo] OK — receive() refused once already received.');

  const canceled = await purchaseOrders.cancel(storeId, second.id);
  assert(canceled.status === PoStatus.Canceled, `expected canceled status, got ${canceled.status}`);

  let cancelAgainRejected = false;
  try {
    await purchaseOrders.cancel(storeId, second.id);
  } catch {
    cancelAgainRejected = true;
  }
  assert(cancelAgainRejected, 'canceling an already-canceled PO must be a real 409, not a silent no-op');
  console.log('[purchase-orders-demo] OK — cancel() is legal once, refused on an already-terminal PO.');

  let updateAfterConfirmedRejected = false;
  try {
    await purchaseOrders.update(storeId, po.id, { note: 'should not be allowed' } as never);
  } catch {
    updateAfterConfirmedRejected = true;
  }
  assert(updateAfterConfirmedRejected, 'update() must refuse a non-draft PO');
  console.log('[purchase-orders-demo] OK — update() refused once confirmed.');

  console.log('[purchase-orders-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[purchase-orders-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[purchase-orders-demo] FAILED:', err);
  process.exit(1);
});
