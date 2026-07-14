import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Order } from './order.entity';

/**
 * Join row for `order` <-> tag (the Tags panel) — `tag_id` is a plain text
 * column, not a relation: catalog owns tags
 * (ADR-2, no cross-DB FK), unlike catalog's own `product_tag`
 * (`@ManyToMany(() => Tag)` + `@JoinTable()`), which can use a real
 * relation because `Tag` lives in the same database there.
 *
 * Composite primary key via a relation needs both a `@Column({ primary: true })`
 * for the id column *and* a `@ManyToOne` + `@JoinColumn` mapped to that
 * same column name — same dual-mapping pattern as catalog's
 * `BundleItem` (see its doc comment for the full explanation of why).
 */
@Entity('order_tag')
export class OrderTag {
  @Column({ type: 'text', name: 'order_id', primary: true })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ type: 'text', name: 'tag_id', primary: true })
  tagId!: string;
}
