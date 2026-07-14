import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

export enum LoyaltyTxnReason {
  Order = 'order',
  Manual = 'manual',
  Referral = 'referral',
}

/**
 * `store_id` is additive beyond the data model's literal DDL (which only
 * shows `account_id`) — every table in this repo carries its own `store_id`
 * for direct scoping/indexing rather than requiring a join through
 * `loyalty_account` on every query, same convention as every other crm
 * table. `account_id` is a same-DB FK.
 *
 * The partial unique index on `(reason, ref_id)` (`ref_id IS NOT NULL`) is
 * the idempotency mechanism for order-triggered accrual — `ref_id` is the
 * order id, a natural key, so a replayed (or genuinely duplicate)
 * `orders.order.placed` for the same order can never double-accrue.
 * `manual`/`referral` reasons have no natural per-row uniqueness
 * requirement, hence the partial (not full-table) index.
 */
@Entity('loyalty_txn')
@Index(['reason', 'refId'], { unique: true, where: 'ref_id IS NOT NULL' })
export class LoyaltyTxn extends TenantScopedEntity {
  @Index()
  @Column({ type: 'text', name: 'account_id' })
  accountId!: string;

  @Column({ type: 'int', name: 'points_delta' })
  pointsDelta!: number;

  @Column({ type: 'text' })
  reason!: LoyaltyTxnReason;

  @Column({ type: 'text', name: 'ref_id', nullable: true })
  refId?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;
}
