import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Idempotency ledger for the shipping-events rollup consumer — one row per
 * `shipping.fulfillment.created` event's `fulfillmentId` already applied to
 * `order_line.fulfilled_qty`. The fulfillment id itself is the primary key
 * (no separate ULID `id`): this table's only job is "has this fulfillment
 * been counted yet," so the natural key doubles as the idempotency check —
 * same "unique-indexed column keyed by the producer's own id" shape as
 * `ShipmentEvent.carrierEventId` in shipping-service.
 */
@Entity('fulfillment_rollup')
export class FulfillmentRollup {
  @PrimaryColumn({ type: 'text', name: 'fulfillment_id' })
  fulfillmentId!: string;

  @Column({ type: 'text', name: 'order_id' })
  orderId!: string;
}
