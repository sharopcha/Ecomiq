export interface ProductCategoryRefDto {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ProductOptionValueDto {
  id: string;
  name: string;
  position: number;
}

export interface ProductOptionDto {
  id: string;
  name: string;
  position: number;
  values: ProductOptionValueDto[];
}

export interface ProductVariantSummaryDto {
  id: string;
  sku: string;
  priceMinor: number | null;
  isDefault: boolean;
  isActive: boolean;
  /** e.g. "Red / Large" */
  optionsSummary: string;
}

/**
 * Storefront-facing product shape — matches `mapProductToStorefront()` in
 * catalog-service exactly (`apps/services/catalog/src/app/storefront/dto/storefront-query.dto.ts`).
 * Used for both the product list and product detail endpoints; `variants`/
 * `options` are only populated by the detail endpoint.
 */
export interface ProductDto {
  id: string;
  storeId: string;
  name: string;
  description: string | null;
  kind: string;
  sku: string;
  priceMinor: number;
  compareAtMinor: number | null;
  ratingAvg: number;
  ratingCount: number;
  vendorName: string | null;
  category: ProductCategoryRefDto | null;
  variants?: ProductVariantSummaryDto[];
  options?: ProductOptionDto[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Offset-paginated envelope for `GET /catalog/storefront/products` — this
 * endpoint predates the shared cursor `paginate()` helper and returns
 * `limit`/`offset`, not `nextCursor` or `page`.
 */
export interface StorefrontProductsResponse {
  items: ProductDto[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Admin CRUD shape for `/api/catalog/products` — matches the full
 * `Product` TypeORM entity fields exposed by catalog-service's admin
 * `ProductsController` (cursor-paginated via the shared `paginate()` helper,
 * see `CursorPaginatedResponse` in `../common`). Distinct from `ProductDto`,
 * which is the narrower public storefront shape.
 */
export interface AdminProductDto {
  id: string;
  storeId: string;
  displayNumber: number;
  name: string;
  description?: string | null;
  status: 'active' | 'draft' | 'archived';
  kind: 'physical' | 'digital';
  sku?: string | null;
  categoryId?: string | null;
  typeId?: string | null;
  vendorId?: string | null;
  category?: { id: string } | null;
  type?: { id: string } | null;
  vendor?: { id: string } | null;
  priceMinor?: number | null;
  compareAtMinor?: number | null;
  costMinor?: number | null;
  wholesaleMinMinor?: number | null;
  wholesaleMaxMinor?: number | null;
  chargeTax?: boolean;
  weightValue?: number | null;
  weightUnit?: string;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  shipsInternationally?: boolean;
  continueSellingOos?: boolean;
  isDropship?: boolean;
  ratingAvg?: number | null;
  ratingCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** Shape shared by categories/vendors/product-types/channels/tags taxonomy lookups. */
export interface CatalogTaxonomyRefDto {
  id: string;
  name: string;
  kind?: string;
  parentId?: string;
  parent?: { id: string } | null;
}
