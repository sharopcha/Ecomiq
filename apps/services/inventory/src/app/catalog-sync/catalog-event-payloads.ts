/**
 * Local mirrors of catalog-service's event payload shapes. There's no shared
 * `libs/contracts` package yet for versioned domain-event schemas, so
 * these are hand-copied from the actual producer code. Keep them in sync
 * with:
 *   apps/services/catalog/src/app/products/products.service.ts (toProductEventPayload)
 *   apps/services/catalog/src/app/product-variants/product-variants.service.ts (toVariantEventPayload)
 *   apps/services/catalog/src/app/events/catalog-event-types.ts (event type strings)
 */

export interface CatalogProductEventPayload {
  productId: string;
  storeId: string;
  displayNumber: number;
  name: string;
  status: string;
  kind: string;
  sku: string | null;
  categoryId: string | null;
  /** Denormalized 2026-07-06 for inventory-service's Inventory list — see the matching comment in catalog's toProductEventPayload. */
  categoryName: string | null;
  typeId: string | null;
  vendorId: string | null;
  priceMinor: number | null;
  compareAtMinor: number | null;
}

export interface CatalogProductArchivedPayload {
  productId: string;
}

export interface CatalogProductRestoredPayload {
  productId: string;
}

export interface CatalogVariantEventPayload {
  productId: string;
  variantId: string;
  sku: string;
  priceMinor: number | null;
  isActive: boolean;
  isDefault: boolean;
  /** Denormalized 2026-07-06 for inventory-service's per-row thumbnail — see the matching comment in catalog's toVariantEventPayload. */
  imageFileId: string | null;
  optionValueIds: string[];
}

export interface CatalogVariantDeletedPayload {
  productId: string;
  variantId: string;
}

/**
 * Event type strings this consumer subscribes to — mirrors the product/variant
 * members of apps/services/catalog/src/app/events/catalog-event-types.ts's
 * `CatalogEventType`. `catalog.price.changed` and the license-key/bundle
 * events are deliberately not consumed here: product.updated/variant.updated
 * already carry the current priceMinor on every price change, and
 * license-keys/bundles aren't rendered on the Inventory list this snapshot
 * exists to serve.
 */
export const CatalogProductEvent = {
  Created: 'catalog.product.created',
  Updated: 'catalog.product.updated',
  Archived: 'catalog.product.archived',
  Restored: 'catalog.product.restored',
} as const;

export const CatalogVariantEvent = {
  Created: 'catalog.variant.created',
  Updated: 'catalog.variant.updated',
  Deleted: 'catalog.variant.deleted',
} as const;
