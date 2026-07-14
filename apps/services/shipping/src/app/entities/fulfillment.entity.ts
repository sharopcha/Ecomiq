import { Column, Entity, OneToMany } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';
import { FulfillmentLine } from './fulfillment-line.entity';
import { TrackingNumber } from './tracking-number.entity';

/**
 * Fulfill Item modal: per-line qty, tracking numbers, notify flag. `orderId`
 * is a plain snapshot-reference column — order lives in order_db (ADR-2),
 * no cross-DB FK. Fulfillment execution lives in shipping_db per the
 * plan's ownership decision (order-service keeps only its
 * `fulfillment_status` rollup column, updated via events).
 */
@Entity('fulfillment')
export class Fulfillment extends TenantScopedEntity {
  @Column({ type: 'text', name: 'order_id' })
  orderId!: string;

  @Column({ type: 'boolean', name: 'notify_customer', default: false })
  notifyCustomer!: boolean;

  @OneToMany(() => FulfillmentLine, (line) => line.fulfillment)
  lines?: FulfillmentLine[];

  @OneToMany(() => TrackingNumber, (tracking) => tracking.fulfillment)
  trackingNumbers?: TrackingNumber[];
}
