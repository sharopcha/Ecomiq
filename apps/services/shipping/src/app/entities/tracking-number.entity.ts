import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';
import { Fulfillment } from './fulfillment.entity';

/**
 * "Add another tracking number" — 1..n per fulfillment. Extends plain
 * `BaseEntity` (id only, no `storeId`) — always reached through its parent
 * `fulfillment`, matching `ShipmentEvent`'s precedent.
 */
@Entity('tracking_number')
export class TrackingNumber extends BaseEntity {
  @ManyToOne(() => Fulfillment, (fulfillment) => fulfillment.trackingNumbers, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'fulfillment_id' })
  fulfillment!: Fulfillment;

  @Column({ type: 'text' })
  value!: string;
}
