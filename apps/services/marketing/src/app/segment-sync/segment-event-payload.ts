/**
 * Local mirror of crm-service's `segment` domain event payload — same
 * hand-copied-per-consumer convention as `order-sync/order-event-payloads.ts`
 * and catalog-service's `review-event-payload.ts`. Keep in sync with:
 *   apps/services/crm/src/app/segments/segments.service.ts (evaluate())
 *   apps/services/crm/src/app/events/crm-event-types.ts (SegmentEventType)
 *
 * There is only one event on this stream — `crm.segment.updated` fires
 * every time `SegmentsService.evaluate()` runs, even with no membership
 * change — no separate created/archived event exists to mirror.
 */
export const SEGMENT_UPDATED_EVENT_TYPE = 'crm.segment.updated';

export interface SegmentEventPayload {
  segmentId: string;
  storeId: string;
  name: string;
  memberCount: number;
  memberEmails: string[];
}
