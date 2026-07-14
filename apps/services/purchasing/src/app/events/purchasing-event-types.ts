/**
 * Event type strings for purchasing-service's outbox rows, matching the
 * repo convention `<service>.<aggregate>.<verb>` (see
 * `apps/services/crm/src/app/events/crm-event-types.ts`).
 *
 * `supplier` is its own aggregate stream —
 * `topicForAggregate('ecomiq', 'purchasing', PURCHASING_SUPPLIER_AGGREGATE_TYPE)`
 * -> `supplier.events`, `aggregateId = supplier.id`.
 */
export const SupplierEventType = {
  /** Published by SuppliersService.create(). */
  SupplierCreated: 'purchasing.supplier.created',
  /** Published by SuppliersService.update()/activate()/deactivate()/toggleFeature()/toggleFavorite(). */
  SupplierUpdated: 'purchasing.supplier.updated',
  /** Published by the supplier-portal auth service's register() (Step 11) — a distinct verb from SupplierCreated since it's supplier-initiated, not admin-initiated. */
  SupplierRegistered: 'purchasing.supplier.registered',
} as const;

export const PURCHASING_SUPPLIER_AGGREGATE_TYPE = 'supplier';

/**
 * `purchase_order` is its own aggregate stream —
 * `topicForAggregate('ecomiq', 'purchasing', PURCHASING_PO_AGGREGATE_TYPE)`
 * -> `po.events`, `aggregateId = purchaseOrder.id`. `PoSent`/`PoReceived`
 * are declared here even though `PurchaseOrdersService` doesn't emit them
 * until Steps 7/8 — the full event vocabulary for this aggregate is fixed
 * by the plan's resource-allocation table (§1), so it's declared once
 * rather than fragmented across the steps that each add one verb.
 */
export const PoEventType = {
  /** Published by PurchaseOrdersService.create(). */
  PoCreated: 'purchasing.po.created',
  /** Published by PurchaseOrdersService.send() (Step 7). */
  PoSent: 'purchasing.po.sent',
  /** Published by PurchaseOrdersService.confirm() — both the manual (this step) and supplier-portal (Step 12) paths. */
  PoConfirmed: 'purchasing.po.confirmed',
  /** Published by PurchaseOrdersService.receive() (Step 8) — fires on partial receipts too. */
  PoReceived: 'purchasing.po.received',
  /** Published by PurchaseOrdersService.cancel(). */
  PoCanceled: 'purchasing.po.canceled',
} as const;

export const PURCHASING_PO_AGGREGATE_TYPE = 'po';
