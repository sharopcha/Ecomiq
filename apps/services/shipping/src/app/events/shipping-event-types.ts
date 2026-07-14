/**
 * Event type strings for shipping-service's outbox rows, matching the repo
 * convention `<service>.<aggregate>.<verb>` (see
 * `apps/services/payment/src/app/events/payment-event-types.ts`).
 *
 * `label` is its own aggregate stream —
 * `topicForAggregate('ecomiq', 'shipping', SHIPPING_LABEL_AGGREGATE_TYPE)` ->
 * `label.events`, `aggregateId = shippingLabel.id`.
 */
export const ShippingLabelEventType = {
  /** Published by LabelsService.purchase() on a successful carrier purchase. */
  LabelPurchased: 'shipping.label.purchased',
  /** Published by LabelsService.purchase() when the carrier port rejects the purchase. */
  LabelPurchaseFailed: 'shipping.label.purchase_failed',
} as const;

export const SHIPPING_LABEL_AGGREGATE_TYPE = 'label';

/**
 * `shipment` is its own aggregate stream —
 * `topicForAggregate('ecomiq', 'shipping', SHIPPING_SHIPMENT_AGGREGATE_TYPE)` ->
 * `shipment.events`, `aggregateId = shipment.id`.
 */
export const ShipmentEventType = {
  /** Published by ShipmentsService.create(). */
  ShipmentCreated: 'shipping.shipment.created',
  /** Published on a transition into `in_progress`. */
  ShipmentUpdated: 'shipping.shipment.updated',
  /** Published on a transition into `arrived`. */
  ShipmentArrived: 'shipping.shipment.arrived',
  /** Published on a transition into `canceled`. */
  ShipmentCanceled: 'shipping.shipment.canceled',
  /**
   * Self-consumed delayed message — armed by `transition()` when a
   * shipment enters `in_progress` with an `expectedArrivalAt` set
   * (`deliverAt = expectedArrivalAt`). Fourth use of the "outbox row with
   * a future `deliverAt` IS the delayed message" mechanism in this repo
   * (inventory reservation expiry, order RMA expiry, order payment
   * timeout). Lands on this same `shipment.events` topic since
   * `aggregateType` is `shipment`.
   */
  ShipmentDelayCheck: 'shipping.shipment.delay_check',
  /** Published when a delay check or manual delay call marks a shipment delayed. */
  ShipmentDelayed: 'shipping.shipment.delayed',
} as const;

export const SHIPPING_SHIPMENT_AGGREGATE_TYPE = 'shipment';

/**
 * `fulfillment` is its own aggregate stream —
 * `topicForAggregate('ecomiq', 'shipping', SHIPPING_FULFILLMENT_AGGREGATE_TYPE)` ->
 * `fulfillment.events`, `aggregateId = fulfillment.id`.
 */
export const ShippingFulfillmentEventType = {
  /** Published by FulfillmentsService.create(). Carries per-line quantities for order-service's future fulfillment-status rollup consumer. */
  FulfillmentCreated: 'shipping.fulfillment.created',
} as const;

export const SHIPPING_FULFILLMENT_AGGREGATE_TYPE = 'fulfillment';

/**
 * `pickup` is its own aggregate stream —
 * `topicForAggregate('ecomiq', 'shipping', SHIPPING_PICKUP_AGGREGATE_TYPE)` ->
 * `pickup.events`, `aggregateId = pickup.id`.
 */
export const ShippingPickupEventType = {
  /** Published by PickupsService.scheduleBulk(), once per row. */
  PickupScheduled: 'shipping.pickup.scheduled',
  /**
   * Self-consumed delayed message — armed alongside `PickupScheduled`
   * (`deliverAt` = pickup morning). Third use of the "outbox row with a
   * future `deliverAt` IS the delayed message" mechanism inside
   * shipping-service (after `shipping.shipment.delay_check`), fifth in the
   * repo overall. Lands on this same `pickup.events` topic since
   * `aggregateType` is `pickup`.
   */
  PickupReminderCheck: 'shipping.pickup.reminder_check',
} as const;

export const SHIPPING_PICKUP_AGGREGATE_TYPE = 'pickup';

/** `ShipmentNotifyService.create()`'s own aggregate stream — not provisioned as a real topic (this command always carries an explicit `topic` override to marketing's `notify.commands`), just the outbox row's own bookkeeping metadata. */
export const SHIPPING_SHIPMENT_NOTIFICATION_AGGREGATE_TYPE = 'shipment_notification';

/**
 * The `notify.send` command contract (marketing-service's `notify.commands`
 * topic, notification-service's real consumer) — refund's precedent
 * (`orders/src/app/refunds/refunds.service.ts`). `template: 'shipment'`/
 * `template: 'pickup_reminder'` have no mapper in notification-service yet;
 * its `notify.send` consumer ack-and-skips unknown template values by
 * design, so these commands can start flowing before notification learns
 * to read them.
 */
export const NOTIFY_SEND_COMMAND = 'notify.send';
