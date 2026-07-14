import { Column, Entity, Index, OneToMany, Unique } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';
import { ShipmentEvent } from './shipment-event.entity';

export enum ShipmentStatus {
  Draft = 'draft',
  InProgress = 'in_progress',
  Arrived = 'arrived',
  Canceled = 'canceled',
}

/**
 * `SHP-5574`; its own workspace, a lifecycle distinct from the order it
 * ships. `orderId`/`fulfillmentId` are plain snapshot-reference columns:
 * order lives in order_db (ADR-2, no cross-DB FK); `fulfillment` is a
 * same-DB table that doesn't exist yet, so no FK constraint until it does.
 * `contactEmail` is additive vs. the original DDL (`destinationAddress`
 * already covered address data) — lets a delay notification be sent
 * without a sync call back to order-service, same snapshot reasoning as
 * `ShippingLabel.returnAddress`/`destinationAddress`.
 */
@Entity('shipment')
@Unique(['storeId', 'displayId'])
export class Shipment extends TenantScopedEntity {
  @Column({ type: 'text', name: 'display_id' })
  displayId!: string;

  @Index()
  @Column({ type: 'text', name: 'order_id' })
  orderId!: string;

  @Column({ type: 'text', name: 'fulfillment_id', nullable: true })
  fulfillmentId?: string | null;

  @Column({ type: 'enum', enum: ShipmentStatus, enumName: 'shipment_status', default: ShipmentStatus.Draft })
  status!: ShipmentStatus;

  @Column({ type: 'boolean', name: 'is_delayed', default: false })
  isDelayed!: boolean;

  @Column({ type: 'text', name: 'delay_reason', nullable: true })
  delayReason?: string | null;

  @Column({ type: 'text', nullable: true })
  carrier?: string | null;

  @Column({ type: 'text', name: 'service_type', nullable: true })
  serviceType?: string | null;

  @Column({ type: 'date', name: 'ship_date', nullable: true })
  shipDate?: string | null;

  @Column({ type: 'jsonb', name: 'origin_address', nullable: true })
  originAddress?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'destination_address', nullable: true })
  destinationAddress?: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', name: 'departure_at', nullable: true })
  departureAt?: Date | null;

  @Column({ type: 'timestamptz', name: 'expected_arrival_at', nullable: true })
  expectedArrivalAt?: Date | null;

  /** "21 days, 6 hours" — derivable/cached, not computed by this step; a future arrival-tracking step can populate it. */
  @Column({ type: 'interval', name: 'total_time_interval', nullable: true })
  totalTimeInterval?: string | null;

  /** 4-icon progress (0..3), advances with status transitions and logged events — never decreases. */
  @Column({ type: 'smallint', name: 'current_stage', default: 0 })
  currentStage!: number;

  @Column({ type: 'text', name: 'contact_email', nullable: true })
  contactEmail?: string | null;

  @OneToMany(() => ShipmentEvent, (event) => event.shipment)
  events?: ShipmentEvent[];
}
