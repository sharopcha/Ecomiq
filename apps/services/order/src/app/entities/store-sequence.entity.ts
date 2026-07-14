import { Column, Entity } from 'typeorm';

/**
 * Per-tenant, per-kind display-number counter — order-service's *own*
 * local copy, not a shared table: cross-DB access to identity's
 * conceptual `store_sequence` is forbidden (ADR-2), so every service that
 * needs sequential display numbers gets its own local table scoped to
 * just the kinds it needs. Kinds here: `order`, `rma`, `invoice` (catalog's
 * own product/variant numbering is a separate, pre-existing stopgap — see
 * `ProductsService.nextDisplayNumber`'s doc comment — not migrated to this
 * pattern).
 *
 * Claimed inside the same insert transaction with `SELECT ... FOR UPDATE`
 * (data-model rule 9) — `orders.service.ts` is the first consumer;
 * `returns.service.ts` and the invoice endpoint reuse the same claim
 * method for their own kinds.
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
