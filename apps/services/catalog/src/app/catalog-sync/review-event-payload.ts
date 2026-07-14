/**
 * Local mirror of crm-service's `product_review` domain event payload — same
 * "no shared contracts package yet, hand-copy from the producer" convention
 * as every other cross-service consumer in this repo. Keep in sync with:
 *   apps/services/crm/src/app/reviews/reviews.service.ts (toEventPayload)
 *   apps/services/crm/src/app/events/crm-event-types.ts (ReviewEventType)
 */
export const REVIEW_PUBLISHED_EVENT_TYPE = 'crm.review.published';
export const REVIEW_ARCHIVED_EVENT_TYPE = 'crm.review.archived';

export interface ReviewEventPayload {
  id: string;
  storeId: string;
  productId: string | null;
  customerId: string | null;
  rating: number;
  status: string;
}
