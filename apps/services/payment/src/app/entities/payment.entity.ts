import { Column, Entity, Index } from 'typeorm';
import { MoneyTransformer, TenantScopedEntity } from '@temp-nx/typeorm';

/**
 * `payment_status` — shared across order-service's `order.payment_status`
 * and this table's own `status`, but each service
 * owns its own Postgres enum type (ADR-2, database-per-service) so the two
 * never actually share a DB-level type.
 */
export enum PaymentStatus {
  Pending = 'pending',
  Paid = 'paid',
  PartiallyRefunded = 'partially_refunded',
  Refunded = 'refunded',
  Failed = 'failed',
  Canceled = 'canceled',
}

/**
 * A payment intent's lifecycle (shape inspired by the original monolith's
 * `payment` table, adapted for the provider-agnostic/microservices
 * reality that table predates):
 *
 * - `orderId` is a plain indexed text column, **not** a `@ManyToOne` — order
 *   lives in order-service's own database (ADR-2); same snapshot-reference
 *   convention as inventory's `Reservation.orderId`.
 * - `idempotencyKey` is how `PaymentsService.createIntent` avoids double
 *   -creating an intent on a retried request — a DB-unique nullable column,
 *   the same mechanism `Reservation.idempotencyKey` uses (payment-service
 *   has no Redis wired; this repo deliberately doesn't add one just for
 *   this). Nullable because not every future caller may supply one, and
 *   Postgres unique indexes tolerate unlimited NULLs.
 * - `clientSecret` is the mock provider's analog of Stripe's
 *   `client_secret` — an opaque token the "storefront" hands back to
 *   confirm/complete the intent client-side. Real meaning is entirely
 *   provider-defined; this column just stores whatever the bound
 *   `PaymentProviderPort` returned.
 * - `provider`/`externalRef` are what let a later webhook or a
 *   second provider adapter (Stripe) resolve back to this row without this
 *   entity ever importing provider-specific code.
 */
@Entity('payment')
export class Payment extends TenantScopedEntity {
  @Index()
  @Column({ type: 'text', name: 'order_id' })
  orderId!: string;

  @Column({ type: 'text', default: 'mock' })
  provider!: string;

  @Column({ type: 'text', name: 'method_brand', nullable: true })
  methodBrand?: string | null;

  @Column({ type: 'text', name: 'method_last4', nullable: true })
  methodLast4?: string | null;

  @Column({
    type: 'bigint',
    name: 'amount_minor',
    transformer: MoneyTransformer,
  })
  amountMinor!: number;

  @Column({ type: 'char', length: 3, default: 'USD' })
  currency!: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status',
    default: PaymentStatus.Pending,
  })
  status!: PaymentStatus;

  /** The provider's own intent id (e.g. mock's `mock_pi_<ulid>`), how a webhook resolves an event back to this row. */
  @Column({ type: 'text', name: 'external_ref', nullable: true })
  externalRef?: string | null;

  /** Caller-supplied idempotency key for `createIntent` — see class doc comment. Unique but nullable (unlimited NULLs allowed). */
  @Index({ unique: true })
  @Column({ type: 'text', name: 'idempotency_key', nullable: true })
  idempotencyKey?: string | null;

  /** Provider-opaque client-side confirmation token — see class doc comment. */
  @Column({ type: 'text', name: 'client_secret', nullable: true })
  clientSecret?: string | null;
}
