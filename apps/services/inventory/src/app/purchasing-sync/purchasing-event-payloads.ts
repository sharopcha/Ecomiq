/**
 * Local mirror of purchasing-service's `purchasing.po.received` event
 * payload shape — same "no shared contracts package for domain event
 * payloads, hand-copied per consumer" convention as `order-event-payloads.ts`
 * (this same service) and catalog-sync's `catalog-event-payloads.ts`. Keep
 * in sync with:
 *   apps/services/purchasing/src/app/purchase-orders/purchase-orders.service.ts (receive/toEventPayload)
 *   apps/services/purchasing/src/app/events/purchasing-event-types.ts
 *
 * `receivedQty` is the line's *cumulative* total after the triggering
 * receive() call, not that call's own qty delta — this consumer's
 * idempotency key needs the cumulative value (see
 * `purchasing-sync.service.ts`'s doc comment).
 */
export const PurchasingPoEvent = {
  Received: 'purchasing.po.received',
} as const;

export interface PoReceivedLinePayload {
  lineId: string;
  variantId: string | null;
  qty: number;
  receivedQty: number;
}

export interface PoReceivedPayload {
  id: string;
  storeId: string;
  deliverToLocationId: string | null;
  lines: PoReceivedLinePayload[];
}
