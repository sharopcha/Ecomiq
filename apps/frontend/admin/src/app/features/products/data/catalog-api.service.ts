import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  Product,
  Category,
  Vendor,
  ProductType,
  Channel,
  Tag,
  Location,
  ProductOption,
  ProductOptionValue,
  ProductVariant,
  StockLevel,
  ProductComment,
  PerformanceMetric,
} from './products.models';
import { ProductsMockService } from './products.mock-service';
import { InventoryApiService } from '../../inventory/data/inventory-api.service';
import type { AdminProductDto, CatalogTaxonomyRefDto } from '@temp-nx/api-types/catalog';
import type { CursorPaginatedResponse } from '@temp-nx/api-types';

/**
 * Real catalog-service client.
 *
 * Talks to the running `catalog-service` through the API gateway. The admin dev
 * proxy forwards `/api` → gateway (`:3000`), and the gateway routes
 * `/api/catalog/*` → catalog-service (stripping the `catalog` segment), so every
 * catalog resource lives under `/api/catalog/...`. The auth interceptor attaches
 * the bearer token for any request whose URL starts with `/api`.
 *
 * ── Casing seam ────────────────────────────────────────────────────────────
 * catalog-service (TypeORM entities) serialises in **camelCase** with money as
 * integer *minor units* (`priceMinor` = 1999) and taxonomy exposed as nested
 * relation objects (`category: { id, name }`). The admin models are **snake_case**
 * (`price_minor`, `category_id`). All translation happens in the mappers below so
 * the components/templates keep consuming the exact same model shape they did
 * against the mock — this is the "swap the seam" the mock was built for.
 *
 * ── Scope (per request: "only catalog related should be wired") ─────────────
 * Wired to real HTTP: products (list/detail/create/update/delete), the five
 * taxonomy lookups (categories, vendors, product-types, channels, tags), and
 * locations (proxied to inventory-service's real warehouse list — the mock
 * always returned a fake "Main Warehouse" regardless of what the store
 * actually has, which is misleading on the product-detail stock card).
 *
 * Still delegated to {@link ProductsMockService} until verified against the live
 * backend — either because the domain isn't owned by catalog-service (stock,
 * comments, performance metrics live in inventory / crm / analytics)
 * or because the per-product sub-resource write flow (options→value-ids→variants)
 * needs a coordinated round-trip that must be validated end-to-end:
 *   product images, product options + values, product variants (read + write),
 *   stock levels, comments, performance metrics.
 * These keep their mock behaviour so no screen regresses.
 */
@Injectable({ providedIn: 'root' })
export class CatalogApiService {
  private readonly http = inject(HttpClient);
  private readonly mock = inject(ProductsMockService);
  private readonly inventory = inject(InventoryApiService);

  private readonly base = '/api/catalog';

  // ── Products ───────────────────────────────────────────────────────────
  getProducts(): Observable<Product[]> {
    return this.http
      .get<CursorPaginatedResponse<AdminProductDto>>(`${this.base}/products`)
      .pipe(map((res) => (res.items ?? []).map((p) => this.mapProduct(p))));
  }

  getProductById(id: string): Observable<Product | undefined> {
    return this.http
      .get<AdminProductDto>(`${this.base}/products/${id}`)
      .pipe(map((p) => (p ? this.mapProduct(p) : undefined)));
  }

  createProduct(product: Partial<Product>): Observable<Product> {
    return this.http
      .post<AdminProductDto>(`${this.base}/products`, this.toProductPayload(product))
      .pipe(map((p) => this.mapProduct(p)));
  }

  updateProduct(id: string, updates: Partial<Product>): Observable<Product> {
    return this.http
      .patch<AdminProductDto>(`${this.base}/products/${id}`, this.toProductPayload(updates))
      .pipe(map((p) => this.mapProduct(p)));
  }

  deleteProduct(id: string): Observable<boolean> {
    return this.http.delete<void>(`${this.base}/products/${id}`).pipe(map(() => true));
  }

  // ── Taxonomy lookups + CRUD ────────────────────────────────────────────
  // catalog-service owns full CRUD for all five of these; the admin previously
  // only ever read them (nowhere to actually add a Category/Vendor/etc. — see
  // the Taxonomy settings page at /products/taxonomy for Categories/Vendors/
  // Product Types, and the inline "+" quick-add on the product form for
  // Sales Channels/Tags).
  getCategories(): Observable<Category[]> {
    return this.list<CatalogTaxonomyRefDto>('categories').pipe(
      map((rows) => rows.map((c) => ({ id: c.id, name: c.name, parent_id: c.parent?.id ?? c.parentId }))),
    );
  }

  createCategory(payload: { name: string; parent_id?: string }): Observable<Category> {
    return this.http
      .post<CatalogTaxonomyRefDto>(`${this.base}/categories`, { name: payload.name, parentId: payload.parent_id })
      .pipe(map((c) => ({ id: c.id, name: c.name, parent_id: c.parent?.id ?? c.parentId })));
  }

  updateCategory(id: string, payload: { name?: string; parent_id?: string }): Observable<Category> {
    return this.http
      .patch<CatalogTaxonomyRefDto>(`${this.base}/categories/${id}`, { name: payload.name, parentId: payload.parent_id })
      .pipe(map((c) => ({ id: c.id, name: c.name, parent_id: c.parent?.id ?? c.parentId })));
  }

  deleteCategory(id: string): Observable<boolean> {
    return this.http.delete<void>(`${this.base}/categories/${id}`).pipe(map(() => true));
  }

  getVendors(): Observable<Vendor[]> {
    return this.list<CatalogTaxonomyRefDto>('vendors').pipe(map((rows) => rows.map((v) => ({ id: v.id, name: v.name }))));
  }

  createVendor(payload: { name: string }): Observable<Vendor> {
    return this.http.post<CatalogTaxonomyRefDto>(`${this.base}/vendors`, payload).pipe(map((v) => ({ id: v.id, name: v.name })));
  }

  updateVendor(id: string, payload: { name: string }): Observable<Vendor> {
    return this.http
      .patch<CatalogTaxonomyRefDto>(`${this.base}/vendors/${id}`, payload)
      .pipe(map((v) => ({ id: v.id, name: v.name })));
  }

  deleteVendor(id: string): Observable<boolean> {
    return this.http.delete<void>(`${this.base}/vendors/${id}`).pipe(map(() => true));
  }

  getProductTypes(): Observable<ProductType[]> {
    return this.list<CatalogTaxonomyRefDto>('product-types').pipe(
      map((rows) => rows.map((t) => ({ id: t.id, name: t.name }))),
    );
  }

  createProductType(payload: { name: string }): Observable<ProductType> {
    return this.http
      .post<CatalogTaxonomyRefDto>(`${this.base}/product-types`, payload)
      .pipe(map((t) => ({ id: t.id, name: t.name })));
  }

  updateProductType(id: string, payload: { name: string }): Observable<ProductType> {
    return this.http
      .patch<CatalogTaxonomyRefDto>(`${this.base}/product-types/${id}`, payload)
      .pipe(map((t) => ({ id: t.id, name: t.name })));
  }

  deleteProductType(id: string): Observable<boolean> {
    return this.http.delete<void>(`${this.base}/product-types/${id}`).pipe(map(() => true));
  }

  getChannels(): Observable<Channel[]> {
    return this.list<CatalogTaxonomyRefDto>('channels').pipe(
      map((rows) =>
        rows.map((c) => ({ id: c.id, name: c.name, kind: (c.kind as Channel['kind']) ?? 'online_store' })),
      ),
    );
  }

  createChannel(payload: { name: string; kind?: Channel['kind'] }): Observable<Channel> {
    return this.http
      .post<CatalogTaxonomyRefDto>(`${this.base}/channels`, payload)
      .pipe(map((c) => ({ id: c.id, name: c.name, kind: (c.kind as Channel['kind']) ?? 'online_store' })));
  }

  deleteChannel(id: string): Observable<boolean> {
    return this.http.delete<void>(`${this.base}/channels/${id}`).pipe(map(() => true));
  }

  getTags(): Observable<Tag[]> {
    return this.list<CatalogTaxonomyRefDto>('tags').pipe(map((rows) => rows.map((t) => ({ id: t.id, name: t.name }))));
  }

  createTag(payload: { name: string }): Observable<Tag> {
    return this.http.post<CatalogTaxonomyRefDto>(`${this.base}/tags`, payload).pipe(map((t) => ({ id: t.id, name: t.name })));
  }

  deleteTag(id: string): Observable<boolean> {
    return this.http.delete<void>(`${this.base}/tags/${id}`).pipe(map(() => true));
  }

  private list<T>(resource: string): Observable<T[]> {
    return this.http.get<CursorPaginatedResponse<T>>(`${this.base}/${resource}`).pipe(map((res) => res.items ?? []));
  }

  // ── Locations (warehouses) ─────────────────────────────────────────────
  // Proxied to inventory-service's real location list, not the catalog mock —
  // a product's stock card should reflect the store's actual warehouses.
  getLocations(): Observable<Location[]> {
    return this.inventory.getLocations(null, 100).pipe(
      map((page) => page.items.map((loc) => ({
        id: loc.id,
        name: loc.name,
        is_active: loc.is_active,
        is_default: loc.is_default,
      }))),
    );
  }

  // ── Delegated to the mock until wired/verified against the live backend ──
  // Non-catalog domains (inventory / crm / analytics) or per-product sub-resource
  // write flows that need an end-to-end round-trip to validate.
  getProductImages(productId: string): Observable<string[]> {
    return this.mock.getProductImages(productId);
  }
  addProductImage(productId: string, imageUrl: string): Observable<string[]> {
    return this.mock.addProductImage(productId, imageUrl);
  }
  removeProductImage(productId: string, imageUrl: string): Observable<string[]> {
    return this.mock.removeProductImage(productId, imageUrl);
  }
  getProductOptions(productId: string): Observable<ProductOption[]> {
    return this.mock.getProductOptions(productId);
  }
  getOptionValues(optionId: string): Observable<ProductOptionValue[]> {
    return this.mock.getOptionValues(optionId);
  }
  saveProductOptionsAndValues(
    productId: string,
    options: { name: string; values: string[]; useImages: boolean }[],
  ): Observable<boolean> {
    return this.mock.saveProductOptionsAndValues(productId, options);
  }
  getProductVariants(productId: string): Observable<ProductVariant[]> {
    return this.mock.getProductVariants(productId);
  }
  saveProductVariants(productId: string, variants: ProductVariant[]): Observable<ProductVariant[]> {
    return this.mock.saveProductVariants(productId, variants);
  }
  getVariantStockLevels(variantId: string): Observable<StockLevel[]> {
    return this.mock.getVariantStockLevels(variantId);
  }
  updateVariantStock(variantId: string, locationId: string, qty: number): Observable<boolean> {
    return this.mock.updateVariantStock(variantId, locationId, qty);
  }
  getProductTotalStock(productId: string): Observable<{ count: number; status: 'High' | 'Low' | 'Out of Stock' }> {
    return this.mock.getProductTotalStock(productId);
  }
  getComments(productId: string): Observable<ProductComment[]> {
    return this.mock.getComments(productId);
  }
  addComment(productId: string, content: string): Observable<ProductComment> {
    return this.mock.addComment(productId, content);
  }
  getPerformanceMetrics(productId: string, period: string): Observable<PerformanceMetric> {
    return this.mock.getPerformanceMetrics(productId, period);
  }

  // ── Mappers ──────────────────────────────────────────────────────────────
  private mapProduct(a: AdminProductDto): Product {
    return {
      id: a.id,
      store_id: a.storeId,
      display_number: a.displayNumber,
      name: a.name,
      description: a.description ?? '',
      status: a.status,
      kind: a.kind,
      sku: a.sku ?? undefined,
      category_id: a.category?.id ?? a.categoryId ?? undefined,
      type_id: a.type?.id ?? a.typeId ?? undefined,
      vendor_id: a.vendor?.id ?? a.vendorId ?? undefined,
      price_minor: a.priceMinor ?? undefined,
      compare_at_minor: a.compareAtMinor ?? undefined,
      cost_minor: a.costMinor ?? undefined,
      wholesale_min_minor: a.wholesaleMinMinor ?? undefined,
      wholesale_max_minor: a.wholesaleMaxMinor ?? undefined,
      charge_tax: a.chargeTax ?? false,
      weight_value: a.weightValue ?? undefined,
      weight_unit: a.weightUnit ?? 'kg',
      length_cm: a.lengthCm ?? undefined,
      width_cm: a.widthCm ?? undefined,
      height_cm: a.heightCm ?? undefined,
      ships_internationally: a.shipsInternationally ?? false,
      continue_selling_oos: a.continueSellingOos ?? false,
      is_dropship: a.isDropship ?? false,
      rating_avg: a.ratingAvg ?? 0,
      rating_count: a.ratingCount ?? 0,
      created_at: a.createdAt,
      updated_at: a.updatedAt,
    };
  }

  /** Model (snake_case, minor units) → Create/UpdateProductDto (camelCase, decimals).
   *  Only defined keys are sent; the backend uses a whitelist that rejects unknowns. */
  private toProductPayload(p: Partial<Product>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const set = (key: string, val: unknown) => {
      if (val !== undefined) out[key] = val;
    };
    const money = (minor?: number) => (minor === undefined ? undefined : minor / 100);

    set('name', p.name);
    set('description', p.description);
    set('status', p.status);
    set('kind', p.kind);
    set('sku', p.sku);
    set('categoryId', p.category_id);
    set('typeId', p.type_id);
    set('vendorId', p.vendor_id);
    set('price', money(p.price_minor));
    set('compareAtPrice', money(p.compare_at_minor));
    set('cost', money(p.cost_minor));
    set('wholesaleMin', money(p.wholesale_min_minor));
    set('wholesaleMax', money(p.wholesale_max_minor));
    set('chargeTax', p.charge_tax);
    set('weightValue', p.weight_value);
    set('weightUnit', p.weight_unit);
    set('lengthCm', p.length_cm);
    set('widthCm', p.width_cm);
    set('heightCm', p.height_cm);
    set('shipsInternationally', p.ships_internationally);
    set('continueSellingOos', p.continue_selling_oos);
    set('isDropship', p.is_dropship);
    return out;
  }
}
