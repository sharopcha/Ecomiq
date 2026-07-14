/**
 * The mock carrier's "provider format" IS the normalized format — no
 * translation step, same shortcut `MockPaymentProvider`/`MockEmailProvider`
 * take for their own webhooks. A real carrier adapter would translate its
 * own payload shape into this one before it ever reaches
 * `TrackingWebhookService`.
 */
export interface CarrierTrackingWebhookEvent {
  /** The carrier's own event id — idempotency key, stamped onto the `shipment_event` row this creates. */
  eventId: string;
  trackingNumber: string;
  kind: 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
  description?: string;
  location?: string;
  /** ISO datetime; defaults to now() if omitted. */
  occurredAt?: string;
}
