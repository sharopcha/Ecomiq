import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';
import { Shipment } from './shipment.entity';

export enum PickupStatus {
  Scheduled = 'scheduled',
  Completed = 'completed',
  Canceled = 'canceled',
}

/** Bulk "Schedule Pickup": per shipment carrier + date + time + note. `shipmentId` is a same-DB FK — both tables live in shipping_db. */
@Entity('pickup')
export class Pickup extends TenantScopedEntity {
  @Index()
  @ManyToOne(() => Shipment, { nullable: false })
  @JoinColumn({ name: 'shipment_id' })
  shipment!: Shipment;

  @Column({ type: 'text' })
  carrier!: string;

  @Column({ type: 'date', name: 'pickup_date' })
  pickupDate!: string;

  @Column({ type: 'time', name: 'pickup_time', nullable: true })
  pickupTime?: string | null;

  @Column({ type: 'text', nullable: true })
  meridiem?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'enum', enum: PickupStatus, enumName: 'pickup_status', default: PickupStatus.Scheduled })
  status!: PickupStatus;
}
