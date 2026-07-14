/**
 * Inventory domain models — snake_case, decimal-free money kept as integer
 * *minor units* (`*_minor`), mirroring `products.models.ts`. All translation
 * from the camelCase wire format happens in `inventory-api.service.ts`.
 */

export interface Paginated<T> {
  items: T[];
  next_cursor: string | null;
}

export type StockStatus = 'out' | 'low' | 'high';

/** Row of `GET /api/inventory/stock-levels` — pre-joined with catalog data.
 *  `id` is null when the row is aggregated across every warehouse
 *  (no location filter applied). */
export interface StockLevelListItem {
  id: string | null;
  variant_id: string;
  sku: string;
  image_file_id: string | null;
  price_minor: number | null;
  product_id: string | null;
  product_name: string | null;
  category_id: string | null;
  category_name: string | null;
  on_hand: number;
  reserved: number;
  available: number;
  low_threshold: number | null;
  status: StockStatus;
}

export interface InventoryLocation {
  id: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  country_code?: string;
}

/** Raw `GET /stock-levels/:id` entity (single-location cell). */
export interface StockLevelDetail {
  id: string;
  store_id: string;
  variant_id: string;
  location: InventoryLocation;
  on_hand: number;
  reserved: number;
  low_threshold: number | null;
  unit_cost_minor: number | null;
  created_at: string;
  updated_at: string;
}

export type StockAlertDirection = 'lower_than' | 'greater_than' | 'equals';
export type StockAlertAction = 'send_email' | 'send_inbox' | 'send_sms' | 'create_task';

export interface StockAlert {
  id: string;
  variant_id: string;
  /** null = watch across every warehouse */
  location_id: string | null;
  threshold: number;
  direction: StockAlertDirection;
  actions: StockAlertAction[];
  is_active: boolean;
}

export type ReorderMethod = 'purchase_order' | 'manual' | 'dropship';

export interface ReorderRule {
  id: string;
  variant_id: string;
  location_id: string | null;
  method: ReorderMethod;
  trigger_level: number;
  reorder_qty: number;
  /** Opaque string — no Supplier API exists yet (future purchasing-service). */
  preferred_supplier_id: string | null;
  lead_time_days: number | null;
  is_active: boolean;
}

export interface Reservation {
  id: string;
  stock_level_id: string;
  order_id: string | null;
  order_line_id: string | null;
  qty: number;
  /** ISO timestamp, fixed 24h from creation */
  reserved_until: string;
  released_at: string | null;
}

export type StockAuditAdjustType = 'quantity' | 'value';
export type StockAuditReason =
  | 'damage'
  | 'expire'
  | 'misplacement'
  | 'thief'
  | 'stocktake_variance'
  | 'custom';

export interface StockAudit {
  id: string;
  adjust_type: StockAuditAdjustType;
  physical_count: number | null;
  available_before: number | null;
  discrepancy: number | null;
  value_delta_minor: number | null;
  reason: StockAuditReason;
  note: string | null;
  actor_id: string | null;
  created_at: string;
}

export type StockMovementKind =
  | 'sale'
  | 'return'
  | 'purchase_receipt'
  | 'adjustment'
  | 'reservation'
  | 'release'
  | 'transfer';

export interface StockMovement {
  id: string;
  kind: StockMovementKind;
  /** signed */
  qty_delta: number;
  ref_table: string | null;
  ref_id: string | null;
  actor_id: string | null;
  created_at: string;
}

/** ⚠️ Mock-only — there is no Supplier backend anywhere yet (handover §5).
 *  Shape mirrors the Supplier workspace screenshots. */
export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  location: string;
  total_products: number;
  is_active: boolean;
  avatar_url?: string;
  joined_date?: string;
  last_login?: string;
  description?: string;
  rating?: number;
  website?: string;
  shipping_carriers?: string[];
}

export interface SupplierReview {
  id: string;
  author_name: string;
  author_avatar: string;
  stars: number;
  title: string;
  body: string;
  timestamp: string;
}
