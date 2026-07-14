import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity, MoneyTransformer } from '@temp-nx/typeorm';
import { Order } from './order.entity';

/**
 * A line item, snapshotted at order-creation time — `name`/`sku`/
 * `variantLabel` are copies of catalog state at that moment, not live
 * references, so a later product rename/deletion doesn't
 * rewrite order history.
 *
 * Extends `BaseEntity` (id only, no `storeId`/timestamps of its own) —
 * `order_line` has no independent lifecycle or tenant column; it's always
 * reached through its parent `order` (`store_id` lives there), matching
 * `BundleItem`'s "join-shaped child row" reasoning even though this isn't
 * a join table.
 *
 * `variantId` is a plain text column (catalog owns variants, ADR-2, no
 * cross-DB FK) — same snapshot-reference convention as payment-service's
 * `Payment.orderId` or inventory's `CatalogVariantSnapshot`.
 *
 * `reservationId` is set by the checkout saga once `ReserveStock`
 * succeeds for this line — a plain text column (inventory owns
 * reservations), so the saga's compensation/commit steps can
 * address the exact inventory hold this line created without needing to
 * re-derive it.
 */
@Entity('order_line')
export class OrderLine extends BaseEntity {
  @Index()
  @ManyToOne(() => Order, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Index()
  @Column({ type: 'text', name: 'variant_id' })
  variantId!: string;

  /**
   * Catalog's validate response already carries `productId` alongside
   * `variantId` (see storefront `resolveLines`), but this column didn't
   * exist until reviews needed it — a review targets a product, not a
   * variant, and there's no catalog call in the review-submission path to
   * resolve one from the other. Nullable because orders placed before this
   * column existed have no value to backfill.
   */
  @Column({ type: 'text', name: 'product_id', nullable: true })
  productId?: string | null;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  sku?: string | null;

  /** "Grey · Quantity 1"-style snapshot — see class doc comment. */
  @Column({ type: 'text', name: 'variant_label', nullable: true })
  variantLabel?: string | null;

  @Column({ type: 'int' })
  qty!: number;

  /** Cumulative units shipped against this line — incremented by the shipping-events rollup consumer as `shipping.fulfillment.created` events arrive. See `FulfillmentRollup`'s doc comment for the idempotency mechanism guarding this against redelivery. */
  @Column({ type: 'int', name: 'fulfilled_qty', default: 0 })
  fulfilledQty!: number;

  @Column({ type: 'bigint', name: 'unit_price_minor', transformer: MoneyTransformer })
  unitPriceMinor!: number;

  @Column({ type: 'text', name: 'image_file_id', nullable: true })
  imageFileId?: string | null;

  /** Set by the checkout saga — see class doc comment. Null until reserved; stays set even after commit/release for audit purposes. */
  @Index()
  @Column({ type: 'text', name: 'reservation_id', nullable: true })
  reservationId?: string | null;
}
