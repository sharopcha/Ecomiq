import { Column, Entity } from 'typeorm';

/**
 * Per-tenant, per-kind display-number counter — purchasing-service's *own*
 * local copy, not a shared table: cross-DB access is forbidden (ADR-2), so
 * every service that needs sequential display numbers gets its own local
 * table scoped to just the kinds it needs. Two kinds here: `supplier`
 * (`SUP-<n>`) and `po` (`PO-<n>`), same claim mechanism as crm's `customer`.
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
