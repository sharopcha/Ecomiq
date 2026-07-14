/**
 * Event type strings for marketing-service's outbox rows, matching the
 * repo convention `<service>.<aggregate>.<verb>`
 * (apps/services/inventory/src/app/events/inventory-event-types.ts).
 *
 * `discount` is its own aggregate stream —
 * `topicForAggregate('ecomiq', 'marketing', DISCOUNT_AGGREGATE_TYPE)` ->
 * `discount.events`, `aggregateId = discount.id`. Campaign events append
 * their own members + aggregate type here rather than starting a new
 * file, same as inventory's single map.
 */
export const MarketingEventType = {
  DiscountCreated: 'marketing.discount.created',
  DiscountUpdated: 'marketing.discount.updated',
  DiscountActivated: 'marketing.discount.activated',
  DiscountArchived: 'marketing.discount.archived',
  CampaignCreated: 'marketing.campaign.created',
  CampaignUpdated: 'marketing.campaign.updated',
  CampaignScheduled: 'marketing.campaign.scheduled',
  CampaignPaused: 'marketing.campaign.paused',
  CampaignArchived: 'marketing.campaign.archived',
  // The self-addressed delayed message `schedule()` produces
  // (deliverAt = scheduleAt); rides the same `campaign` aggregate topic as
  // every other campaign event, same convention as order-service's
  // `ReturnExpiryCheck`.
  CampaignFire: 'marketing.campaign.fire',
  CampaignSent: 'marketing.campaign.sent',
} as const;

export const DISCOUNT_AGGREGATE_TYPE = 'discount';
export const CAMPAIGN_AGGREGATE_TYPE = 'campaign';
