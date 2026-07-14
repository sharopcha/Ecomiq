/**
 * Local mirror of inventory-service's `inventory.reorder.triggered` event
 * payload shape — same "no shared contracts package for domain event
 * payloads, hand-copied per consumer" convention as inventory's own
 * `order-event-payloads.ts`/`catalog-event-payloads.ts`. Keep in sync with:
 *   apps/services/inventory/src/app/stock-movements/stock-movements.service.ts (checkAndTriggerReorders)
 *   apps/services/inventory/src/app/events/inventory-event-types.ts
 *
 * Already a complete payload per this plan's §0 context note — no unit
 * cost, hence this consumer's own catalog-item lookup.
 */
export const InventoryEvent = {
  ReorderTriggered: 'inventory.reorder.triggered',
} as const;

export interface ReorderTriggeredPayload {
  stockLevelId: string;
  variantId: string;
  locationId: string;
  reorderRuleId: string;
  triggerLevel: number;
  reorderQty: number;
  method: string;
  preferredSupplierId: string | null;
  leadTimeDays: number | null;
  available: number;
  onHand: number;
  reserved: number;
}
