/**
 * Event type strings for catalog-service's outbox rows, following the
 * `<service>.<aggregate>.<verb>` convention. All of them land on the *same*
 * Pulsar topic —
 * `topicForAggregate('ecomiq', 'catalog', CATALOG_AGGREGATE_TYPE)` ->
 * `product.events` — because variants are children of the product
 * aggregate, not an independent one: topics are per-aggregate-*stream*
 * (topics.ts), not per event type, and a consumer that needs a consistent
 * per-product ordering (e.g. inventory-service reacting to variant.created
 * only after product.created) needs both on one topic with `aggregateId =
 * product.id` throughout, including variant-level events.
 */
export const CatalogEventType = {
  ProductCreated: 'catalog.product.created',
  ProductUpdated: 'catalog.product.updated',
  ProductArchived: 'catalog.product.archived',
  ProductRestored: 'catalog.product.restored',
  VariantCreated: 'catalog.variant.created',
  VariantUpdated: 'catalog.variant.updated',
  VariantDeleted: 'catalog.variant.deleted',
  /**
   * Emitted *in addition to* product.updated/variant.updated whenever a
   * price actually changes — lets a consumer (e.g. a future cart/pricing
   * cache) subscribe to price movements specifically without parsing every
   * product/variant update for a price diff itself.
   */
  PriceChanged: 'catalog.price.changed',
  /**
   * License keys are children of a product (product_id FK), same
   * relationship as variants — so these ride the *product* aggregate stream
   * with aggregateId = productId, not their own topic, for the same ordering
   * reason variant events do.
   */
  LicenseKeysAdded: 'catalog.license-key.added',
  LicenseKeyReserved: 'catalog.license-key.reserved',
  LicenseKeyRevoked: 'catalog.license-key.revoked',
  /**
   * Bundles, unlike variants/license-keys, are *not* scoped to a single
   * product — one bundle can span variants from several different
   * products — so they get their own aggregate/topic (CATALOG_BUNDLE_AGGREGATE_TYPE)
   * rather than riding the product stream.
   */
  BundleCreated: 'catalog.bundle.created',
  BundleUpdated: 'catalog.bundle.updated',
  BundleDeleted: 'catalog.bundle.deleted',
} as const;

/** Product, variant, and license-key events all belong to the product aggregate — see the module doc comment above. */
export const CATALOG_AGGREGATE_TYPE = 'product';

/** Bundles are their own aggregate/topic (`bundle.events`) — see the CatalogEventType doc comment on Bundle* events. */
export const CATALOG_BUNDLE_AGGREGATE_TYPE = 'bundle';
