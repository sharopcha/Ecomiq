import { Column, Entity, Unique } from 'typeorm';
import { MoneyTransformer, TenantScopedEntity } from '@temp-nx/typeorm';

export enum DiscountKind {
  Percentage = 'percentage',
  FixedAmount = 'fixed_amount',
  FreeShipping = 'free_shipping',
}

export enum DiscountStatus {
  Draft = 'draft',
  Active = 'active',
  Expired = 'expired',
  Archived = 'archived',
}

/**
 * Discount code — ships before the rest of marketing because the checkout
 * saga needs `ValidateDiscount`.
 *
 * `code` is unique per store (`UNIQUE(store_id, code)`); uppercased/trimmed
 * at the service layer (`DiscountsService`), not here, so the constraint
 * always sees the normalized form regardless of what a caller submits.
 *
 * `value`'s meaning depends on `kind` — documented here since the column
 * itself can't express it: for `percentage`, basis points (`1000` = 10.00%,
 * matching money's own minor-units convention of "smallest unit, no
 * floats"); for `fixed_amount`, `amountMinor` (same currency-minor-units
 * convention as `Payment.amountMinor` — deliberately a plain `int`, not
 * `MoneyTransformer`'s `bigint`, since a single discount is never going to
 * approach `bigint`-necessitating scale); for `free_shipping`, unused (`0`
 * by convention — the shipping fee itself is waived elsewhere, this column
 * has nothing to say about it). `validate-discount.util.ts`'s
 * `computeDiscountMinor` is the one place this convention is interpreted.
 */
@Entity('discount')
@Unique(['storeId', 'code'])
export class Discount extends TenantScopedEntity {
  @Column({ type: 'text' })
  code!: string;

  @Column({
    type: 'enum',
    enum: DiscountKind,
    enumName: 'discount_kind',
  })
  kind!: DiscountKind;

  /** Basis points | amountMinor | unused — see class doc comment for which, per `kind`. */
  @Column({ type: 'int' })
  value!: number;

  @Column({ type: 'int', name: 'usage_limit', nullable: true })
  usageLimit?: number | null;

  @Column({ type: 'int', name: 'usage_count', default: 0 })
  usageCount!: number;

  @Column({ type: 'boolean', name: 'once_per_customer', default: false })
  oncePerCustomer!: boolean;

  @Column({ type: 'timestamptz', name: 'starts_at', nullable: true })
  startsAt?: Date | null;

  @Column({ type: 'timestamptz', name: 'ends_at', nullable: true })
  endsAt?: Date | null;

  @Column({
    type: 'enum',
    enum: DiscountStatus,
    enumName: 'discount_status',
    default: DiscountStatus.Draft,
  })
  status!: DiscountStatus;

  /** Cheap, common real-world constraint: no discount below this subtotal. Null = no minimum. */
  @Column({
    type: 'bigint',
    name: 'min_subtotal_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  minSubtotalMinor?: number | null;
}
