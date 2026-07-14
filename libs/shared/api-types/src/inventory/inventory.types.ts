export type StockStatus = 'out' | 'low' | 'high';
export type StockAlertDirection = 'lower_than' | 'greater_than' | 'equals';
export type StockAlertAction = 'send_email' | 'send_inbox' | 'send_sms' | 'create_task';
export type ReorderMethod = 'purchase_order' | 'manual' | 'dropship';
export type StockAuditAdjustType = 'quantity' | 'value';
export type StockAuditReason =
  | 'damage'
  | 'expire'
  | 'misplacement'
  | 'thief'
  | 'stocktake_variance'
  | 'custom';
export type StockMovementKind =
  | 'sale'
  | 'return'
  | 'purchase_receipt'
  | 'adjustment'
  | 'reservation'
  | 'release'
  | 'transfer';

export interface StockLevelListItemDto {
  id: string | null;
  variantId: string;
  sku: string;
  imageFileId?: string | null;
  priceMinor?: number | null;
  productId?: string | null;
  productName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  onHand: number;
  reserved: number;
  available: number;
  lowThreshold?: number | null;
  status: StockStatus;
}

export interface InventoryLocationDto {
  id: string;
  name: string;
  isActive?: boolean;
  isDefault?: boolean;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
}

export interface StockLevelDetailDto {
  id: string;
  storeId: string;
  variantId: string;
  location: InventoryLocationDto;
  onHand: number;
  reserved: number;
  lowThreshold?: number | null;
  unitCostMinor?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockAlertDto {
  id: string;
  variantId: string;
  locationId?: string | null;
  threshold: number;
  direction: StockAlertDirection;
  actions?: StockAlertAction[];
  isActive?: boolean;
}

export interface ReorderRuleDto {
  id: string;
  variantId: string;
  locationId?: string | null;
  method: ReorderMethod;
  triggerLevel: number;
  reorderQty: number;
  preferredSupplierId?: string | null;
  leadTimeDays?: number | null;
  isActive?: boolean;
}

export interface ReservationDto {
  id: string;
  stockLevelId?: string;
  stockLevel?: { id: string } | null;
  orderId?: string | null;
  orderLineId?: string | null;
  qty: number;
  reservedUntil: string;
  releasedAt?: string | null;
}

export interface StockAuditDto {
  id: string;
  adjustType: StockAuditAdjustType;
  physicalCount?: number | null;
  availableBefore?: number | null;
  discrepancy?: number | null;
  valueDeltaMinor?: number | null;
  reason: StockAuditReason;
  note?: string | null;
  actorId?: string | null;
  createdAt: string;
}

export interface StockMovementDto {
  id: string;
  kind: StockMovementKind;
  qtyDelta: number;
  refTable?: string | null;
  refId?: string | null;
  actorId?: string | null;
  createdAt: string;
}
