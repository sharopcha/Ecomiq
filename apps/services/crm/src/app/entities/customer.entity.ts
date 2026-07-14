import { Column, Entity, Index } from 'typeorm';
import { MoneyTransformer, TenantScopedEntity } from '@temp-nx/typeorm';

/** Matches the `order_channel_type` Postgres enum — crm's own copy, no cross-DB reference (ADR-2). */
export enum CustomerSource {
  OnlineStore = 'online_store',
  Pos = 'pos',
  Manual = 'manual',
  Marketplace = 'marketplace',
  MobileApp = 'mobile_app',
}

export enum CustomerStatus {
  Active = 'active',
  Archived = 'archived',
}

/**
 * `total_orders`/`total_spent_minor`/`last_online_at` are denormalized
 * rollups written by the orders.order.placed consumer (order rollup
 * step), not by CustomersService directly — this CRUD module only reads
 * them. `password_hash`/`registered_at` are additive nullable columns from
 * customer auth — admin-created/imported customers simply have none until
 * they register. `referral_code` is nullable (generated lazily, on a
 * customer's first "my code" request — not every customer needs one) and
 * unique per store while set (`(store_id, referral_code) WHERE
 * referral_code IS NOT NULL` — see `ReferralsService.getOrCreateCode`).
 */
@Entity('customer')
export class Customer extends TenantScopedEntity {
  @Index()
  @Column({ type: 'text', name: 'display_id' })
  displayId!: string;

  @Column({ type: 'text', name: 'full_name' })
  fullName!: string;

  @Column({ type: 'citext', nullable: true })
  email?: string | null;

  @Column({ type: 'text', nullable: true })
  phone?: string | null;

  @Column({ type: 'text', name: 'avatar_file_id', nullable: true })
  avatarFileId?: string | null;

  @Column({
    type: 'enum',
    enum: CustomerSource,
    enumName: 'order_channel_type',
    default: CustomerSource.OnlineStore,
  })
  source!: CustomerSource;

  @Column({ type: 'text', default: CustomerStatus.Active })
  status!: CustomerStatus;

  @Column({ type: 'int', name: 'total_orders', default: 0 })
  totalOrders!: number;

  @Column({
    type: 'bigint',
    name: 'total_spent_minor',
    default: 0,
    transformer: MoneyTransformer,
  })
  totalSpentMinor!: number;

  @Column({ type: 'timestamptz', name: 'last_online_at', nullable: true })
  lastOnlineAt?: Date | null;

  @Column({ type: 'text', name: 'password_hash', nullable: true })
  passwordHash?: string | null;

  @Column({ type: 'timestamptz', name: 'registered_at', nullable: true })
  registeredAt?: Date | null;

  @Index(['storeId', 'referralCode'], { unique: true, where: 'referral_code IS NOT NULL' })
  @Column({ type: 'text', name: 'referral_code', nullable: true })
  referralCode?: string | null;
}
