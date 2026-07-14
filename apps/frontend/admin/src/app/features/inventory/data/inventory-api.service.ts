import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  Paginated,
  StockLevelListItem,
  StockLevelDetail,
  InventoryLocation,
  StockAlert,
  StockAlertAction,
  StockAlertDirection,
  ReorderRule,
  ReorderMethod,
  Reservation,
  StockAudit,
  StockAuditAdjustType,
  StockAuditReason,
  StockMovement,
  StockStatus,
} from './inventory-models';
import type { CursorPaginatedResponse } from '@temp-nx/api-types';
import type {
  StockLevelListItemDto,
  StockLevelDetailDto,
  InventoryLocationDto,
  StockAlertDto,
  ReorderRuleDto,
  ReservationDto,
  StockAuditDto,
  StockMovementDto,
} from '@temp-nx/api-types/inventory';

/**
 * Real inventory-service client.
 *
 * Talks to the running `inventory-service` through the API gateway
 * (`/api/inventory/*`, dumb reverse proxy — inventory-service verifies the JWT
 * itself). The auth interceptor attaches the bearer token for any `/api` URL.
 *
 * ── Casing seam ────────────────────────────────────────────────────────────
 * Same pattern as `catalog-api.service.ts`: the wire format is **camelCase**
 * with money as integer minor units (`priceMinor`) on reads and **decimals**
 * (`unitCost`, `valueDelta`) on write DTOs. All translation happens in the
 * private mappers below so components/templates only ever see snake_case,
 * minor-unit models.
 *
 * ── Pagination ─────────────────────────────────────────────────────────────
 * Every list endpoint returns `{ items, nextCursor }` and accepts
 * `?cursor=&limit=` (default 20, max 100).
 */
@Injectable({ providedIn: 'root' })
export class InventoryApiService {
  private readonly http = inject(HttpClient);

  private readonly base = '/api/inventory';

  // ── Stock Levels ─────────────────────────────────────────────────────────
  getStockLevels(query: {
    locationId?: string | null;
    categoryId?: string | null;
    stockLevel?: StockStatus | null;
    search?: string | null;
    variantId?: string | null;
    cursor?: string | null;
    limit?: number;
  } = {}): Observable<Paginated<StockLevelListItem>> {
    let params = this.pageParams(query.cursor, query.limit);
    if (query.locationId) params = params.set('locationId', query.locationId);
    if (query.categoryId) params = params.set('categoryId', query.categoryId);
    if (query.stockLevel) params = params.set('stockLevel', query.stockLevel);
    if (query.search) params = params.set('search', query.search);
    if (query.variantId) params = params.set('variantId', query.variantId);
    return this.http
      .get<CursorPaginatedResponse<StockLevelListItemDto>>(`${this.base}/stock-levels`, { params })
      .pipe(map((res) => this.mapPage(res, (r) => this.mapStockLevelListItem(r))));
  }

  getStockLevelById(id: string): Observable<StockLevelDetail> {
    return this.http
      .get<StockLevelDetailDto>(`${this.base}/stock-levels/${id}`)
      .pipe(map((r) => this.mapStockLevelDetail(r)));
  }

  /** "Assign this variant to this warehouse" — every cell starts at on_hand 0;
   *  quantity only ever enters via Audit Stock or a stock movement. */
  createStockLevel(payload: {
    variant_id: string;
    location_id: string;
    low_threshold?: number;
    unit_cost_minor?: number;
  }): Observable<StockLevelDetail> {
    const body: Record<string, unknown> = {
      variantId: payload.variant_id,
      locationId: payload.location_id,
    };
    if (payload.low_threshold !== undefined) body['lowThreshold'] = payload.low_threshold;
    if (payload.unit_cost_minor !== undefined) body['unitCost'] = payload.unit_cost_minor / 100;
    return this.http
      .post<StockLevelDetailDto>(`${this.base}/stock-levels`, body)
      .pipe(map((r) => this.mapStockLevelDetail(r)));
  }

  updateStockLevel(
    id: string,
    updates: { low_threshold?: number | null; unit_cost_minor?: number | null },
  ): Observable<StockLevelDetail> {
    const body: Record<string, unknown> = {};
    if (updates.low_threshold !== undefined) body['lowThreshold'] = updates.low_threshold;
    if (updates.unit_cost_minor !== undefined)
      body['unitCost'] = updates.unit_cost_minor === null ? null : updates.unit_cost_minor / 100;
    return this.http
      .patch<StockLevelDetailDto>(`${this.base}/stock-levels/${id}`, body)
      .pipe(map((r) => this.mapStockLevelDetail(r)));
  }

  /** 409s if on_hand/reserved aren't both zero. */
  deleteStockLevel(id: string): Observable<boolean> {
    return this.http.delete<void>(`${this.base}/stock-levels/${id}`).pipe(map(() => true));
  }

  /**
   * Resolve the real `stock_level.id` for a (variant, location) pair.
   *
   * The aggregated list rows carry `id: null`, but Audit Stock / Reserve Item
   * need a concrete stock-level id. Backend now supports `?variantId=`
   * directly (was previously a `?locationId=&search=<sku>` scan matched
   * client-side) — a single precise lookup, one row max.
   */
  resolveStockLevelId(variantId: string, locationId: string): Observable<string | null> {
    return this.getStockLevels({ locationId, variantId, limit: 1 }).pipe(
      map((page) => page.items[0]?.id ?? null),
    );
  }

  // ── Locations (warehouses) ───────────────────────────────────────────────
  getLocations(cursor?: string | null, limit?: number): Observable<Paginated<InventoryLocation>> {
    return this.http
      .get<CursorPaginatedResponse<InventoryLocationDto>>(`${this.base}/locations`, { params: this.pageParams(cursor, limit) })
      .pipe(map((res) => this.mapPage(res, (r) => this.mapLocation(r))));
  }

  getLocationById(id: string): Observable<InventoryLocation> {
    return this.http.get<InventoryLocationDto>(`${this.base}/locations/${id}`).pipe(map((r) => this.mapLocation(r)));
  }

  createLocation(payload: Partial<InventoryLocation> & { name: string }): Observable<InventoryLocation> {
    return this.http
      .post<InventoryLocationDto>(`${this.base}/locations`, this.toLocationPayload(payload))
      .pipe(map((r) => this.mapLocation(r)));
  }

  updateLocation(id: string, updates: Partial<InventoryLocation>): Observable<InventoryLocation> {
    return this.http
      .patch<InventoryLocationDto>(`${this.base}/locations/${id}`, this.toLocationPayload(updates))
      .pipe(map((r) => this.mapLocation(r)));
  }

  deleteLocation(id: string): Observable<boolean> {
    return this.http.delete<void>(`${this.base}/locations/${id}`).pipe(map(() => true));
  }

  // ── Stock Alerts ─────────────────────────────────────────────────────────
  getStockAlerts(query: { variantId?: string; cursor?: string | null; limit?: number } = {}): Observable<Paginated<StockAlert>> {
    let params = this.pageParams(query.cursor, query.limit);
    if (query.variantId) params = params.set('variantId', query.variantId);
    return this.http
      .get<CursorPaginatedResponse<StockAlertDto>>(`${this.base}/stock-alerts`, { params })
      .pipe(map((res) => this.mapPage(res, (r) => this.mapStockAlert(r))));
  }

  createStockAlert(payload: {
    variant_id: string;
    threshold: number;
    location_id?: string | null;
    direction?: StockAlertDirection;
    actions?: StockAlertAction[];
    is_active?: boolean;
  }): Observable<StockAlert> {
    const body: Record<string, unknown> = { variantId: payload.variant_id, threshold: payload.threshold };
    if (payload.location_id !== undefined) body['locationId'] = payload.location_id;
    if (payload.direction !== undefined) body['direction'] = payload.direction;
    if (payload.actions !== undefined) body['actions'] = payload.actions;
    if (payload.is_active !== undefined) body['isActive'] = payload.is_active;
    return this.http.post<StockAlertDto>(`${this.base}/stock-alerts`, body).pipe(map((r) => this.mapStockAlert(r)));
  }

  /** `variant_id` is NOT updatable — delete + recreate instead. */
  updateStockAlert(
    id: string,
    updates: Partial<Pick<StockAlert, 'threshold' | 'direction' | 'actions' | 'is_active' | 'location_id'>>,
  ): Observable<StockAlert> {
    const body: Record<string, unknown> = {};
    if (updates.threshold !== undefined) body['threshold'] = updates.threshold;
    if (updates.direction !== undefined) body['direction'] = updates.direction;
    if (updates.actions !== undefined) body['actions'] = updates.actions;
    if (updates.is_active !== undefined) body['isActive'] = updates.is_active;
    if (updates.location_id !== undefined) body['locationId'] = updates.location_id;
    return this.http
      .patch<StockAlertDto>(`${this.base}/stock-alerts/${id}`, body)
      .pipe(map((r) => this.mapStockAlert(r)));
  }

  deleteStockAlert(id: string): Observable<boolean> {
    return this.http.delete<void>(`${this.base}/stock-alerts/${id}`).pipe(map(() => true));
  }

  // ── Reorder Rules ────────────────────────────────────────────────────────
  getReorderRules(query: { variantId?: string; cursor?: string | null; limit?: number } = {}): Observable<Paginated<ReorderRule>> {
    let params = this.pageParams(query.cursor, query.limit);
    if (query.variantId) params = params.set('variantId', query.variantId);
    return this.http
      .get<CursorPaginatedResponse<ReorderRuleDto>>(`${this.base}/reorder-rules`, { params })
      .pipe(map((res) => this.mapPage(res, (r) => this.mapReorderRule(r))));
  }

  createReorderRule(payload: {
    variant_id: string;
    trigger_level: number;
    reorder_qty: number;
    location_id?: string | null;
    method?: ReorderMethod;
    preferred_supplier_id?: string | null;
    lead_time_days?: number | null;
    is_active?: boolean;
  }): Observable<ReorderRule> {
    const body: Record<string, unknown> = {
      variantId: payload.variant_id,
      triggerLevel: payload.trigger_level,
      reorderQty: payload.reorder_qty,
    };
    if (payload.location_id !== undefined) body['locationId'] = payload.location_id;
    if (payload.method !== undefined) body['method'] = payload.method;
    if (payload.preferred_supplier_id !== undefined) body['preferredSupplierId'] = payload.preferred_supplier_id;
    if (payload.lead_time_days !== undefined) body['leadTimeDays'] = payload.lead_time_days;
    if (payload.is_active !== undefined) body['isActive'] = payload.is_active;
    return this.http
      .post<ReorderRuleDto>(`${this.base}/reorder-rules`, body)
      .pipe(map((r) => this.mapReorderRule(r)));
  }

  updateReorderRule(
    id: string,
    updates: Partial<
      Pick<ReorderRule, 'trigger_level' | 'reorder_qty' | 'method' | 'preferred_supplier_id' | 'lead_time_days' | 'is_active' | 'location_id'>
    >,
  ): Observable<ReorderRule> {
    const body: Record<string, unknown> = {};
    if (updates.trigger_level !== undefined) body['triggerLevel'] = updates.trigger_level;
    if (updates.reorder_qty !== undefined) body['reorderQty'] = updates.reorder_qty;
    if (updates.method !== undefined) body['method'] = updates.method;
    if (updates.preferred_supplier_id !== undefined) body['preferredSupplierId'] = updates.preferred_supplier_id;
    if (updates.lead_time_days !== undefined) body['leadTimeDays'] = updates.lead_time_days;
    if (updates.is_active !== undefined) body['isActive'] = updates.is_active;
    if (updates.location_id !== undefined) body['locationId'] = updates.location_id;
    return this.http
      .patch<ReorderRuleDto>(`${this.base}/reorder-rules/${id}`, body)
      .pipe(map((r) => this.mapReorderRule(r)));
  }

  deleteReorderRule(id: string): Observable<boolean> {
    return this.http.delete<void>(`${this.base}/reorder-rules/${id}`).pipe(map(() => true));
  }

  // ── Reservations ─────────────────────────────────────────────────────────
  /** GET requires at least one of stockLevelId / variantId / orderId (400 with none). */
  getReservations(query: {
    stockLevelId?: string;
    variantId?: string;
    orderId?: string;
    cursor?: string | null;
    limit?: number;
  }): Observable<Paginated<Reservation>> {
    let params = this.pageParams(query.cursor, query.limit);
    if (query.stockLevelId) params = params.set('stockLevelId', query.stockLevelId);
    if (query.variantId) params = params.set('variantId', query.variantId);
    if (query.orderId) params = params.set('orderId', query.orderId);
    return this.http
      .get<CursorPaginatedResponse<ReservationDto>>(`${this.base}/reservations`, { params })
      .pipe(map((res) => this.mapPage(res, (r) => this.mapReservation(r))));
  }

  /** 409 if not enough available to reserve. Auto-expires 24h after creation. */
  createReservation(payload: {
    stock_level_id: string;
    qty: number;
    order_id?: string;
    order_line_id?: string;
  }): Observable<Reservation> {
    const body: Record<string, unknown> = { stockLevelId: payload.stock_level_id, qty: payload.qty };
    if (payload.order_id !== undefined) body['orderId'] = payload.order_id;
    if (payload.order_line_id !== undefined) body['orderLineId'] = payload.order_line_id;
    return this.http
      .post<ReservationDto>(`${this.base}/reservations`, body)
      .pipe(map((r) => this.mapReservation(r)));
  }

  /** A reservation's only transition: releasedAt null → set. */
  releaseReservation(id: string): Observable<Reservation> {
    return this.http
      .post<ReservationDto>(`${this.base}/reservations/${id}/release`, {})
      .pipe(map((r) => this.mapReservation(r)));
  }

  // ── Stock Audits (append-only ledger) ────────────────────────────────────
  /** GET requires at least one of stockLevelId / variantId. `createdFrom`/`createdTo`
   *  are optional inclusive ISO 8601 bounds on `created_at`. */
  getStockAudits(query: {
    stockLevelId?: string;
    variantId?: string;
    createdFrom?: string | null;
    createdTo?: string | null;
    cursor?: string | null;
    limit?: number;
  }): Observable<Paginated<StockAudit>> {
    let params = this.pageParams(query.cursor, query.limit);
    if (query.stockLevelId) params = params.set('stockLevelId', query.stockLevelId);
    if (query.variantId) params = params.set('variantId', query.variantId);
    if (query.createdFrom) params = params.set('createdFrom', query.createdFrom);
    if (query.createdTo) params = params.set('createdTo', query.createdTo);
    return this.http
      .get<CursorPaginatedResponse<StockAuditDto>>(`${this.base}/stock-audits`, { params })
      .pipe(map((res) => this.mapPage(res, (r) => this.mapStockAudit(r))));
  }

  /** Send `physical_count` for quantity mode, `value_delta_minor` for value mode
   *  (converted to a decimal `valueDelta` on the wire). */
  createStockAudit(payload: {
    stock_level_id: string;
    adjust_type: StockAuditAdjustType;
    physical_count?: number;
    value_delta_minor?: number;
    reason: StockAuditReason;
    note?: string;
  }): Observable<StockAudit> {
    const body: Record<string, unknown> = {
      stockLevelId: payload.stock_level_id,
      adjustType: payload.adjust_type,
      reason: payload.reason,
    };
    if (payload.physical_count !== undefined) body['physicalCount'] = payload.physical_count;
    if (payload.value_delta_minor !== undefined) body['valueDelta'] = payload.value_delta_minor / 100;
    if (payload.note !== undefined) body['note'] = payload.note;
    return this.http
      .post<StockAuditDto>(`${this.base}/stock-audits`, body)
      .pipe(map((r) => this.mapStockAudit(r)));
  }

  // ── Stock Movements (read-only ledger) ───────────────────────────────────
  /** GET requires at least one of stockLevelId / variantId. `createdFrom`/`createdTo`
   *  are optional inclusive ISO 8601 bounds on `created_at`. */
  getStockMovements(query: {
    stockLevelId?: string;
    variantId?: string;
    createdFrom?: string | null;
    createdTo?: string | null;
    cursor?: string | null;
    limit?: number;
  }): Observable<Paginated<StockMovement>> {
    let params = this.pageParams(query.cursor, query.limit);
    if (query.stockLevelId) params = params.set('stockLevelId', query.stockLevelId);
    if (query.variantId) params = params.set('variantId', query.variantId);
    if (query.createdFrom) params = params.set('createdFrom', query.createdFrom);
    if (query.createdTo) params = params.set('createdTo', query.createdTo);
    return this.http
      .get<CursorPaginatedResponse<StockMovementDto>>(`${this.base}/stock-movements`, { params })
      .pipe(map((res) => this.mapPage(res, (r) => this.mapStockMovement(r))));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  private pageParams(cursor?: string | null, limit?: number): HttpParams {
    let params = new HttpParams();
    if (cursor) params = params.set('cursor', cursor);
    if (limit !== undefined) params = params.set('limit', String(limit));
    return params;
  }

  private mapPage<A, T>(res: CursorPaginatedResponse<A>, mapItem: (a: A) => T): Paginated<T> {
    return { items: (res.items ?? []).map(mapItem), next_cursor: res.nextCursor ?? null };
  }

  // ── Mappers (camelCase wire → snake_case model) ─────────────────────────
  private mapStockLevelListItem(a: StockLevelListItemDto): StockLevelListItem {
    return {
      id: a.id ?? null,
      variant_id: a.variantId,
      sku: a.sku,
      image_file_id: a.imageFileId ?? null,
      price_minor: a.priceMinor ?? null,
      product_id: a.productId ?? null,
      product_name: a.productName ?? null,
      category_id: a.categoryId ?? null,
      category_name: a.categoryName ?? null,
      on_hand: a.onHand,
      reserved: a.reserved,
      available: a.available,
      low_threshold: a.lowThreshold ?? null,
      status: a.status,
    };
  }

  private mapStockLevelDetail(a: StockLevelDetailDto): StockLevelDetail {
    return {
      id: a.id,
      store_id: a.storeId,
      variant_id: a.variantId,
      location: this.mapLocation(a.location),
      on_hand: a.onHand,
      reserved: a.reserved,
      low_threshold: a.lowThreshold ?? null,
      unit_cost_minor: a.unitCostMinor ?? null,
      created_at: a.createdAt,
      updated_at: a.updatedAt,
    };
  }

  private mapLocation(a: InventoryLocationDto): InventoryLocation {
    return {
      id: a.id,
      name: a.name,
      is_active: a.isActive ?? true,
      is_default: a.isDefault ?? false,
      address_line1: a.addressLine1 ?? undefined,
      address_line2: a.addressLine2 ?? undefined,
      city: a.city ?? undefined,
      region: a.region ?? undefined,
      postal_code: a.postalCode ?? undefined,
      country_code: a.countryCode ?? undefined,
    };
  }

  private toLocationPayload(l: Partial<InventoryLocation>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const set = (key: string, val: unknown) => {
      if (val !== undefined) out[key] = val;
    };
    set('name', l.name);
    set('isActive', l.is_active);
    set('isDefault', l.is_default);
    set('addressLine1', l.address_line1);
    set('addressLine2', l.address_line2);
    set('city', l.city);
    set('region', l.region);
    set('postalCode', l.postal_code);
    set('countryCode', l.country_code);
    return out;
  }

  private mapStockAlert(a: StockAlertDto): StockAlert {
    return {
      id: a.id,
      variant_id: a.variantId,
      location_id: a.locationId ?? null,
      threshold: a.threshold,
      direction: a.direction,
      actions: a.actions ?? [],
      is_active: a.isActive ?? true,
    };
  }

  private mapReorderRule(a: ReorderRuleDto): ReorderRule {
    return {
      id: a.id,
      variant_id: a.variantId,
      location_id: a.locationId ?? null,
      method: a.method,
      trigger_level: a.triggerLevel,
      reorder_qty: a.reorderQty,
      preferred_supplier_id: a.preferredSupplierId ?? null,
      lead_time_days: a.leadTimeDays ?? null,
      is_active: a.isActive ?? true,
    };
  }

  private mapReservation(a: ReservationDto): Reservation {
    return {
      id: a.id,
      stock_level_id: a.stockLevelId ?? a.stockLevel?.id ?? '',
      order_id: a.orderId ?? null,
      order_line_id: a.orderLineId ?? null,
      qty: a.qty,
      reserved_until: a.reservedUntil,
      released_at: a.releasedAt ?? null,
    };
  }

  private mapStockAudit(a: StockAuditDto): StockAudit {
    return {
      id: a.id,
      adjust_type: a.adjustType,
      physical_count: a.physicalCount ?? null,
      available_before: a.availableBefore ?? null,
      discrepancy: a.discrepancy ?? null,
      value_delta_minor: a.valueDeltaMinor ?? null,
      reason: a.reason,
      note: a.note ?? null,
      actor_id: a.actorId ?? null,
      created_at: a.createdAt,
    };
  }

  private mapStockMovement(a: StockMovementDto): StockMovement {
    return {
      id: a.id,
      kind: a.kind,
      qty_delta: a.qtyDelta,
      ref_table: a.refTable ?? null,
      ref_id: a.refId ?? null,
      actor_id: a.actorId ?? null,
      created_at: a.createdAt,
    };
  }
}

