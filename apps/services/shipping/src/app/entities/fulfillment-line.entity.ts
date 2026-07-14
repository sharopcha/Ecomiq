import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Fulfillment } from './fulfillment.entity';

/**
 * Per-line qty being fulfilled ("1 of 1"). Composite PK
 * `(fulfillment_id, order_line_id)`, no `id`/timestamps of its own —
 * matches the DDL literally, same "join-shaped child row" reasoning as
 * catalog's `BundleItem`. `orderLineId` is a plain snapshot-reference
 * column — order_line lives in order_db (ADR-2), no cross-DB FK.
 */
@Entity('fulfillment_line')
export class FulfillmentLine {
  @Column({ type: 'text', name: 'fulfillment_id', primary: true })
  fulfillmentId!: string;

  @Column({ type: 'text', name: 'order_line_id', primary: true })
  orderLineId!: string;

  @ManyToOne(() => Fulfillment, (fulfillment) => fulfillment.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fulfillment_id' })
  fulfillment!: Fulfillment;

  @Column({ type: 'int' })
  qty!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'weight_lb', nullable: true })
  weightLb?: number | null;
}
