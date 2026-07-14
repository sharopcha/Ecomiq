import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';
import { Shipment } from './shipment.entity';

export enum ShipmentEventKind {
  OrderPlaced = 'order_placed',
  PreparingToShip = 'preparing_to_ship',
  ConfirmShipment = 'confirm_shipment',
  PickedUp = 'picked_up',
  InTransit = 'in_transit',
  OutForDelivery = 'out_for_delivery',
  Delivered = 'delivered',
  Exception = 'exception',
}

/**
 * Shipment Status timeline entry — append-only (no update/delete
 * endpoint), same "ledger, not editable state" reasoning as
 * `stock_movement`/`comment`. Extends `BaseEntity` (id only, no `storeId`)
 * — always reached through its parent `shipment`, matching
 * `ShippingLabelPackage`'s precedent. `occurredAt` is caller-settable
 * (distinct from an insert timestamp) so a carrier update reporting
 * something that already happened can be logged with its real time.
 */
@Entity('shipment_event')
export class ShipmentEvent extends BaseEntity {
  @Index()
  @ManyToOne(() => Shipment, (shipment) => shipment.events, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipment_id' })
  shipment!: Shipment;

  @Column({ type: 'enum', enum: ShipmentEventKind, enumName: 'shipment_event_kind' })
  kind!: ShipmentEventKind;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'text', nullable: true })
  location?: string | null;

  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt!: Date;

  /**
   * Additive vs. the original DDL — the carrier tracking webhook's own
   * event id, for idempotency (a redelivered webhook must not create a
   * second timeline entry). Null for manually-logged entries; a partial
   * unique index (migration) enforces uniqueness only where set.
   */
  @Column({ type: 'text', name: 'carrier_event_id', nullable: true })
  carrierEventId?: string | null;
}
