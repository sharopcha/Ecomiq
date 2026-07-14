import { Column, Entity, Index, OneToMany } from 'typeorm';
import { MoneyTransformer, NumericTransformer, TenantScopedEntity } from '@temp-nx/typeorm';
import { PurchaseOrderLine } from './purchase-order-line.entity';

export enum PoStatus {
  Draft = 'draft',
  Sent = 'sent',
  Confirmed = 'confirmed',
  PartiallyReceived = 'partially_received',
  Received = 'received',
  Canceled = 'canceled',
}

export enum PaymentTerms {
  Cod = 'cod',
  Prepaid = 'prepaid',
  Net15 = 'net_15',
  Net30 = 'net_30',
  Net60 = 'net_60',
}

/**
 * `assigned_to` (app_user id, identity_db) and `deliver_to_location_id`
 * (location id, inventory_db) are opaque text columns, not FKs — cross-DB
 * (ADR-2). `subtotal_minor`/`total_minor` are always server-computed from
 * `PurchaseOrderLine` rows + `tax_rate` (see `po-totals.util.ts`), never
 * accepted from the client. `sent_at` is stamped by Step 7's send endpoint,
 * nullable here from day one.
 *
 * `source_reorder_rule_id` is additive (Step 10) — set only on POs the
 * `AutoDraftPoService` consumer creates from an `inventory.reorder.triggered`
 * event, null on every merchant-created PO. The class-level partial unique
 * index below caps a reorder rule at one *open* auto-draft PO at a time —
 * re-triggers while one is already open are no-ops (crm's partial-unique-
 * index precedent); a fresh trigger after the previous auto-draft reaches a
 * terminal status is legal again.
 */
@Entity('purchase_order')
@Index('purchase_order_open_auto_draft_idx', ['sourceReorderRuleId'], {
  unique: true,
  where: "source_reorder_rule_id IS NOT NULL AND status NOT IN ('received', 'canceled')",
})
export class PurchaseOrder extends TenantScopedEntity {
  @Column({ type: 'text', name: 'display_id' })
  displayId!: string;

  @Column({ type: 'text', name: 'supplier_id' })
  supplierId!: string;

  @Column({ type: 'enum', enum: PoStatus, enumName: 'po_status', default: PoStatus.Draft })
  status!: PoStatus;

  @Column({ type: 'date', name: 'expected_delivery_date', nullable: true })
  expectedDeliveryDate?: string | null;

  @Column({ type: 'text', name: 'assigned_to', nullable: true })
  assignedTo?: string | null;

  @Column({
    type: 'enum',
    enum: PaymentTerms,
    enumName: 'payment_terms',
    name: 'payment_terms',
    default: PaymentTerms.Cod,
  })
  paymentTerms!: PaymentTerms;

  @Column({ type: 'text', name: 'deliver_to_location_id', nullable: true })
  deliverToLocationId?: string | null;

  @Column({ type: 'text', nullable: true })
  carrier?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({
    type: 'bigint',
    name: 'subtotal_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  subtotalMinor?: number | null;

  @Column({
    type: 'numeric',
    name: 'tax_rate',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: NumericTransformer,
  })
  taxRate?: number | null;

  @Column({
    type: 'bigint',
    name: 'total_minor',
    nullable: true,
    transformer: MoneyTransformer,
  })
  totalMinor?: number | null;

  @Column({ type: 'citext', name: 'email_to', nullable: true })
  emailTo?: string | null;

  @Column({ type: 'text', name: 'email_subject', nullable: true })
  emailSubject?: string | null;

  @Column({ type: 'text', name: 'email_body', nullable: true })
  emailBody?: string | null;

  @Column({ type: 'timestamptz', name: 'sent_at', nullable: true })
  sentAt?: Date | null;

  @Column({ type: 'text', name: 'source_reorder_rule_id', nullable: true })
  sourceReorderRuleId?: string | null;

  @OneToMany(() => PurchaseOrderLine, (line) => line.purchaseOrder)
  lines?: PurchaseOrderLine[];
}
