/**
 * "Low"/"High" (and "Out of stock") badge logic for the Inventory list
 * screen (screenshots: "20 unit · Low", "100 unit · High", "0 unit" with no
 * badge). Pure, DB-free — unit tested alongside the rest of this service's
 * accumulated pure logic, same cadence catalog-service used
 * (pricing/variant-matrix/etc.).
 *
 * `available` is `on_hand - reserved`, not raw `on_hand` — callers must
 * always pass the subtracted value, not just `on_hand`, since a heavily
 * reserved cell can show plenty of `on_hand` while `available` is actually low.
 *
 * A duplicate of this exact comparison also lives as inline SQL in
 * stock-levels.service.ts's list query (`STOCK_STATUS_CASE_SQL`) — the list
 * endpoint aggregates on_hand/reserved/threshold across locations via
 * `SUM()` and needs the bucket filter (`?stockLevel=low`) applied *before*
 * pagination, which only a DB-side expression can do correctly. Keep both
 * in sync if this logic ever changes.
 */
export type StockStatus = 'out' | 'low' | 'high';

export function computeStockStatus(available: number, lowThreshold: number | null): StockStatus {
  if (available <= 0) return 'out';
  if (lowThreshold !== null && available <= lowThreshold) return 'low';
  return 'high';
}
