import { Column, Entity, Index, Unique } from 'typeorm';
import { MoneyTransformer, TenantScopedEntity } from '@temp-nx/typeorm';

export enum OrderChannelType {
  OnlineStore = 'online_store',
  Pos = 'pos',
  Manual = 'manual',
  Marketplace = 'marketplace',
  MobileApp = 'mobile_app',
}

export enum OrderStatus {
  Draft = 'draft',
  Open = 'open',
  Completed = 'completed',
  Canceled = 'canceled',
}

export enum OrderPaymentStatus {
  Pending = 'pending',
  Paid = 'paid',
  PartiallyRefunded = 'partially_refunded',
  Refunded = 'refunded',
  Failed = 'failed',
  Canceled = 'canceled',
}

export enum FulfillmentStatus {
  Unfulfilled = 'unfulfilled',
  PartiallyFulfilled = 'partially_fulfilled',
  Fulfilled = 'fulfilled',
  Canceled = 'canceled',
}

export enum OrderStage {
  ReviewOrder = 'review_order',
  PreparingOrder = 'preparing_order',
  Shipping = 'shipping',
  Delivered = 'delivered',
}

/**
 * The order aggregate root, adapted for microservices: `channel_id`/
 * `customer_id` were real FKs in the original monolith DDL — catalog owns
 * channels and
 * crm-service (not built) will own customers, so both stay plain text
 * columns here (ADR-2, no cross-DB FKs), same convention as every other
 * cross-service reference in this repo.
 *
 * `payment_status`'s enum values are identical to payment-service's own
 * `PaymentStatus` — this is *not* a shared type, just parallel Postgres
 * enums in two separate databases (ADR-2) that happen to describe the
 * same concept; order-service learns the real status via
 * `payments.payment.succeeded`/`.failed` events, it doesn't
 * derive it independently.
 *
 * `"order"` is a reserved SQL word — `@Entity({ name: 'order' })` handles
 * this the same way every TypeORM-generated identifier already gets
 * double-quoted; the hand-written migration must quote it explicitly too
 * (`CREATE TABLE "order"`).
 *
 * `discountId`/`discountCode` are saga-support additions beyond the
 * original DDL (not part of the original data model): `discountId` is set
 * once `ValidateDiscount` succeeds during checkout, `discountCode` is a
 * snapshot of what was actually applied (the code itself could be
 * edited/archived later; the order should keep showing what the customer
 * saw at checkout time).
 */
// `(store_id, order_date)` — the migration additionally sorts `order_date
// DESC` (the "Order list default view" index) to match the actual
// list-view query; TypeORM's `@Index` decorator has no
// way to express per-column sort direction, so `synchronize:true` can only
// ever produce the plain-ascending form. This is a known, accepted diff
// between the hand-written migration and a `synchronize` run — same
// category of documented drift as TESTING.md's identity_db entries — not
// a bug, a decorator-API limitation.
@Entity({ name: 'order' })
@Unique(['storeId', 'displayNumber'])
@Index(['storeId', 'orderDate'])
@Index(['storeId', 'paymentStatus', 'fulfillmentStatus'])
@Index(['storeId', 'customerId'])
export class Order extends TenantScopedEntity {
  @Column({ type: 'int', name: 'display_number' })
  displayNumber!: number;

  /** Opaque reference — customer/crm-service doesn't exist yet (§0 known gap). */
  @Column({ type: 'text', name: 'customer_id', nullable: true })
  customerId?: string | null;

  /** Opaque reference — catalog owns channels, no cross-DB FK (ADR-2). */
  @Column({ type: 'text', name: 'channel_id', nullable: true })
  channelId?: string | null;

  @Column({
    type: 'enum',
    enum: OrderChannelType,
    enumName: 'order_channel_type',
    name: 'channel_type',
    default: OrderChannelType.OnlineStore,
  })
  channelType!: OrderChannelType;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    default: OrderStatus.Open,
  })
  status!: OrderStatus;

  @Column({
    type: 'enum',
    enum: OrderPaymentStatus,
    enumName: 'payment_status',
    name: 'payment_status',
    default: OrderPaymentStatus.Pending,
  })
  paymentStatus!: OrderPaymentStatus;

  @Column({
    type: 'enum',
    enum: FulfillmentStatus,
    enumName: 'fulfillment_status',
    name: 'fulfillment_status',
    default: FulfillmentStatus.Unfulfilled,
  })
  fulfillmentStatus!: FulfillmentStatus;

  @Column({
    type: 'enum',
    enum: OrderStage,
    enumName: 'order_stage',
    default: OrderStage.ReviewOrder,
  })
  stage!: OrderStage;

  @Column({ type: 'timestamptz', name: 'order_date', default: () => 'now()' })
  orderDate!: Date;

  @Column({ type: 'date', name: 'estimated_arrival_start', nullable: true })
  estimatedArrivalStart?: string | null;

  @Column({ type: 'date', name: 'estimated_arrival_end', nullable: true })
  estimatedArrivalEnd?: string | null;

  @Column({ type: 'bigint', name: 'subtotal_minor', default: 0, transformer: MoneyTransformer })
  subtotalMinor!: number;

  /** Free-form label ("Free shipping", a carrier name) — not a relation, shipping-service doesn't exist yet (§0 known gap). */
  @Column({ type: 'text', name: 'shipping_type', nullable: true })
  shippingType?: string | null;

  @Column({ type: 'bigint', name: 'shipping_fee_minor', default: 0, transformer: MoneyTransformer })
  shippingFeeMinor!: number;

  @Column({ type: 'bigint', name: 'discount_minor', default: 0, transformer: MoneyTransformer })
  discountMinor!: number;

  @Column({ type: 'bigint', name: 'tax_minor', default: 0, transformer: MoneyTransformer })
  taxMinor!: number;

  @Column({ type: 'bigint', name: 'total_minor', default: 0, transformer: MoneyTransformer })
  totalMinor!: number;

  @Column({ type: 'char', length: 3, default: 'USD' })
  currency!: string;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** Snapshot at purchase time (immutable) — same reasoning as the original DDL's comment. */
  @Column({ type: 'jsonb', name: 'shipping_address', nullable: true })
  shippingAddress?: Record<string, unknown> | null;

  @Column({ type: 'text', name: 'contact_email', nullable: true })
  contactEmail?: string | null;

  @Column({ type: 'text', name: 'contact_phone', nullable: true })
  contactPhone?: string | null;

  @Column({ type: 'timestamptz', name: 'canceled_at', nullable: true })
  canceledAt?: Date | null;

  @Column({ type: 'text', name: 'cancel_reason', nullable: true })
  cancelReason?: string | null;

  /** Set once ValidateDiscount succeeds during checkout — plain text, marketing-service owns discounts (ADR-2). */
  @Column({ type: 'text', name: 'discount_id', nullable: true })
  discountId?: string | null;

  /** Snapshot of the code actually applied — the live code could be edited/archived later. */
  @Column({ type: 'text', name: 'discount_code', nullable: true })
  discountCode?: string | null;

  /**
   * Set once `payments.payment.succeeded` lands (the checkout saga's
   * payment-result consumer) — plain text, payment-service owns `Payment`
   * in its own database (ADR-2, no cross-DB FK). `Refund.paymentId` is
   * resolved from this same value once the refund saga needs it. Added in
   * a later migration than the rest of this entity — the column didn't
   * exist until the saga actually had a payment id to write here.
   */
  @Column({ type: 'text', name: 'payment_id', nullable: true })
  paymentId?: string | null;

  /**
   * Set from `shipping.shipment.updated`/`.arrived`'s `displayId` field the
   * first time either fires for this order (`ShippingEventsController`) —
   * shipping-service owns `Shipment` in its own database (ADR-2, no
   * cross-DB FK), same plain-text-reference convention as `paymentId`.
   * Null until the shipment leaves `draft` (no earlier event carries a
   * display id). Lets the storefront call shipping-service's public
   * tracking endpoint (`GET /track/:storeId/:displayId`) without a second
   * customer-scoped cross-service lookup.
   */
  @Column({ type: 'text', name: 'shipment_display_id', nullable: true })
  shipmentDisplayId?: string | null;
}
