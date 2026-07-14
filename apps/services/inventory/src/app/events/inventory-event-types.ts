/**
 * Event type strings for inventory-service's outbox rows, matching
 * catalog's `<service>.<aggregate>.<verb>` convention
 * (apps/services/catalog/src/app/events/catalog-event-types.ts).
 *
 * Each `stock_level` row is its own aggregate stream —
 * `topicForAggregate('ecomiq', 'inventory', STOCK_LEVEL_AGGREGATE_TYPE)` ->
 * `stock_level.events` — so every mutation of a given variant×location cell
 * (the movement ledger, the low-stock signal, reservations, reorder
 * triggers) lands on one ordered stream per cell, `aggregateId =
 * stock_level.id`. New event kinds append their own members here rather
 * than starting a new file, same as catalog's single `CatalogEventType`
 * map.
 */
export const InventoryEventType = {
  /** Published by StockMovementsService.record() — the one place on_hand/reserved ever change. */
  StockAdjusted: 'inventory.stock.adjusted',
  /**
   * Published by StockMovementsService's post-mutation crossing check —
   * once per active StockAlert whose `direction`/`threshold`
   * newly matches `available` as a *direct result* of this movement (it was
   * not already matching beforehand). Carries the alert's `actions` array so
   * a future notification-service knows what to do with it; inventory-service
   * itself never sends an email/SMS/task.
   */
  StockLow: 'inventory.stock.low',
  /** Published by ReservationsService.create() — a 24h hold against a stock_level's `reserved` quantity. */
  ReservationCreated: 'inventory.reservation.created',
  /** Published by ReservationsService.release() — an *explicit* release (merchant cancel, or a future order-service fulfillment callback), as opposed to the automatic 24h timeout release, which is `inventory.reservation.expired`. */
  ReservationReleased: 'inventory.reservation.released',
  /**
   * Published by ReservationsService.expire() once a reservation's
   * 24h hold times out with nothing else having released it first. Same
   * public "a reservation ended" shape as `.released` — consumers that just
   * want to know "is this reservation still active" can treat the two
   * identically; the distinct event type exists for anything that cares
   * *why* it ended (e.g. a future analytics/ops view of expiry rates).
   */
  ReservationExpired: 'inventory.reservation.expired',
  /**
   * Published by `ReservationsService.commit()` — order-service's own
   * `orders.order.placed` consumer calls
   * this once a checkout's payment succeeds, converting a reservation hold
   * into the definitive sale: releases `reserved` AND decrements `on_hand`
   * in the same transaction (two `StockMovement` rows, `release` then
   * `sale`, both against this same reservation). Distinct from `.released`/
   * `.expired` — those two just end a hold with `on_hand` untouched; this
   * one is the only reservation-lifecycle event that also moves stock.
   */
  ReservationCommitted: 'inventory.reservation.committed',
  /**
   * **Not a public domain event** — a self-consumed trigger. Published
   * alongside `.created` with `deliverAt: reservedUntil` (a real Pulsar
   * delayed message, see OutboxMessage.deliverAt), and consumed by
   * inventory-service's own `ReservationExpiryController` (a second
   * PulsarServer subscription, on inventory's *own* namespace, wired
   * alongside the catalog-consuming one in main.ts) to fire
   * `expire()`. Rides the same `reservation.events` topic as `.created`/
   * `.released`/`.expired` — any other future consumer of that topic simply
   * has no handler for this event type and acks-and-ignores it (see
   * PulsarServer.handleMessage's no-handler branch), so it's safe to leave
   * on the shared stream rather than needing a private topic.
   */
  ReservationExpiryCheck: 'inventory.reservation.expiry-check',
  /**
   * Published by StockMovementsService's post-mutation reorder check
   * (alongside the stock-alert check) — once per active
   * ReorderRule whose `triggerLevel` newly satisfies `available <=
   * triggerLevel` as a *direct result* of this movement (fresh crossing,
   * same "only fire once until it clears and re-crosses" semantics as
   * `.stock.low`). Carries `reorderQty`/`method`/`preferredSupplierId`/
   * `leadTimeDays` so a future purchasing-service can draft a purchase
   * order; inventory-service itself never creates one.
   */
  ReorderTriggered: 'inventory.reorder.triggered',
} as const;

/** stock_level is the aggregate every inventory.stock.* event describes — see doc comment above. */
export const STOCK_LEVEL_AGGREGATE_TYPE = 'stock_level';

/**
 * Reservations get their *own* aggregate/topic (`reservation.events`),
 * separate from `stock_level.events` — `inventory.reservation.*` is a
 * distinct event family from `inventory.stock.*`, and a per-reservation
 * stream (`aggregateId = reservation.id`) is what the 24h-expiry consumer
 * needs: it has to track one specific reservation's created →
 * released/expired lifecycle in order, not interleaved with every other
 * movement against the same cell. Same reasoning as catalog's bundle
 * events getting `CATALOG_BUNDLE_AGGREGATE_TYPE` instead of riding the
 * product stream.
 */
export const RESERVATION_AGGREGATE_TYPE = 'reservation';
