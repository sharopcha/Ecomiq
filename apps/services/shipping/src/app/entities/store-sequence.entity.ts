import { Column, Entity } from 'typeorm';

/**
 * Per-tenant, per-kind display-number counter — shipping-service's *own*
 * local copy, not a shared table: cross-DB access is forbidden (ADR-2), so
 * every service that needs sequential display numbers gets its own local
 * table scoped to just the kinds it needs. Only kind here: `shipment`
 * (`SHP-<n>`), same claim mechanism as order-service's `store_sequence`
 * (`rma`, `order`, `invoice`).
 */
@Entity('store_sequence')
export class StoreSequence {
  @Column({ type: 'text', name: 'store_id', primary: true })
  storeId!: string;

  @Column({ type: 'text', primary: true })
  kind!: string;

  @Column({ type: 'int', name: 'next_value', default: 1 })
  nextValue!: number;
}
