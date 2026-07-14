/**
 * Local mirror of inventory-service's `inventory.stock.low` event — there's
 * no shared `libs/contracts` package yet for versioned domain-event
 * schemas, so this is hand-copied from the actual producer code (same
 * convention as inventory's own `catalog-event-payloads.ts`). Keep in sync
 * with:
 *   apps/services/inventory/src/app/stock-movements/stock-movements.service.ts
 *     (checkAndPublishLowStockAlerts's payload)
 *   apps/services/inventory/src/app/events/inventory-event-types.ts
 *     (InventoryEventType.StockLow = 'inventory.stock.low')
 *   apps/services/inventory/src/app/entities/stock-alert.entity.ts
 *     (AlertAction enum)
 */

export const STOCK_LOW_EVENT_TYPE = 'inventory.stock.low';

/** Matches inventory's `AlertAction` enum values. */
export type StockAlertAction = 'send_email' | 'send_inbox' | 'send_sms' | 'create_task';

export interface StockLowPayload {
  stockLevelId: string;
  variantId: string;
  locationId: string | null;
  alertId: string;
  threshold: number;
  direction: string;
  actions: StockAlertAction[];
  available: number;
  onHand: number;
  reserved: number;
  status: string;
}
