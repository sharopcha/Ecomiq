import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity, MoneyTransformer } from '@temp-nx/typeorm';
import { PurchaseOrder } from './purchase-order.entity';

/**
 * Extends `BaseEntity` (id only, no `storeId`/timestamps of its own) —
 * `purchase_order_line` has no independent lifecycle or tenant column; it's
 * always reached through its parent `purchase_order` (`store_id` lives
 * there), same "join-shaped child row" shape as order-service's `OrderLine`.
 *
 * `supplierCatalogItemId` is a real same-DB FK (both tables live in
 * purchasing_db, enforced at the migration level) but kept as a plain
 * column, not a TypeORM relation — nothing here needs to load the catalog
 * item eagerly. `variantId` is an opaque cross-DB reference (catalog_db) —
 * no FK, matching `OrderLine.variantId`'s own precedent.
 */
@Entity('purchase_order_line')
export class PurchaseOrderLine extends BaseEntity {
  @Index()
  @ManyToOne(() => PurchaseOrder, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'po_id' })
  purchaseOrder!: PurchaseOrder;

  @Column({ type: 'text', name: 'supplier_catalog_item_id', nullable: true })
  supplierCatalogItemId?: string | null;

  @Column({ type: 'text', name: 'variant_id', nullable: true })
  variantId?: string | null;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text', nullable: true })
  sku?: string | null;

  @Column({ type: 'int' })
  qty!: number;

  @Column({
    type: 'bigint',
    name: 'unit_cost_minor',
    transformer: MoneyTransformer,
  })
  unitCostMinor!: number;

  @Column({ type: 'int', name: 'received_qty', default: 0 })
  receivedQty!: number;
}
