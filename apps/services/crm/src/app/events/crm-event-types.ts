/**
 * Event type strings for crm-service's outbox rows, matching the repo
 * convention `<service>.<aggregate>.<verb>` (see
 * `apps/services/shipping/src/app/events/shipping-event-types.ts`).
 *
 * `customer` is its own aggregate stream —
 * `topicForAggregate('ecomiq', 'crm', CRM_CUSTOMER_AGGREGATE_TYPE)` ->
 * `customer.events`, `aggregateId = customer.id`.
 */
export const CustomerEventType = {
  /** Published by CustomersService.create(). */
  CustomerCreated: 'crm.customer.created',
  /** Published by CustomersService.update()/archive(). */
  CustomerUpdated: 'crm.customer.updated',
  /** Published by AuthService.register() — a distinct verb from CustomerCreated since it's customer-initiated, not admin-initiated. */
  CustomerRegistered: 'crm.customer.registered',
} as const;

export const CRM_CUSTOMER_AGGREGATE_TYPE = 'customer';

/**
 * `review` is its own aggregate stream —
 * `topicForAggregate('ecomiq', 'crm', CRM_REVIEW_AGGREGATE_TYPE)` ->
 * `review.events`, `aggregateId = productReview.id`. `ReviewPublished` is
 * catalog-service's consumer trigger for `product.rating_avg`/
 * `rating_count` recompute (see catalog-service's `CatalogSyncModule`).
 */
export const ReviewEventType = {
  /** Published by ReviewsService.create(). */
  ReviewCreated: 'crm.review.created',
  /** Published by ReviewsService.publish(). */
  ReviewPublished: 'crm.review.published',
  /** Published by ReviewsService.archive(). */
  ReviewArchived: 'crm.review.archived',
} as const;

export const CRM_REVIEW_AGGREGATE_TYPE = 'review';

/**
 * `loyalty` is its own aggregate stream —
 * `topicForAggregate('ecomiq', 'crm', CRM_LOYALTY_AGGREGATE_TYPE)` ->
 * `loyalty.events`, `aggregateId = loyaltyAccount.id`.
 */
export const LoyaltyEventType = {
  /** Published by LoyaltyService whenever a txn actually lands (skipped on a replayed/duplicate accrual). */
  LoyaltyAccrued: 'crm.loyalty.accrued',
} as const;

export const CRM_LOYALTY_AGGREGATE_TYPE = 'loyalty';

/**
 * `referral` has no aggregate stream of its own — the plan's resource
 * allocation (§1) puts `crm.referral.completed` on the *same*
 * `crm/loyalty.events` topic as loyalty accruals (only 4 topics total:
 * customer/review/loyalty/segment), so `ReferralsService` publishes with
 * `aggregateType: CRM_LOYALTY_AGGREGATE_TYPE` even though `aggregateId` is
 * the referral's own id, not a loyalty account's.
 */
export const ReferralEventType = {
  /** Published by ReferralsService.completeIfEligible() on the referee's first placed order. */
  ReferralCompleted: 'crm.referral.completed',
} as const;

/**
 * `segment` is its own aggregate stream —
 * `topicForAggregate('ecomiq', 'crm', CRM_SEGMENT_AGGREGATE_TYPE)` ->
 * `segment.events`, `aggregateId = segment.id`. marketing-service's own
 * consumer (a later step) upserts a thin snapshot from this payload — no
 * sync call back to crm needed for either member count or recipient list.
 */
export const SegmentEventType = {
  /** Published by SegmentsService.evaluate() every time, even if membership didn't change. */
  SegmentUpdated: 'crm.segment.updated',
} as const;

export const CRM_SEGMENT_AGGREGATE_TYPE = 'segment';
