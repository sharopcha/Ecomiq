import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';
import { ReturnRequest } from './return-request.entity';
import { OrderLine } from './order-line.entity';

/**
 * Which order lines (and how many units of each) an RMA covers — both
 * `returnRequest` and `orderLine` are real same-DB FKs (order_line lives
 * in this same database, unlike catalog's variant it snapshots).
 */
@Entity('return_line')
export class ReturnLine extends BaseEntity {
  @Index()
  @ManyToOne(() => ReturnRequest, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_id' })
  returnRequest!: ReturnRequest;

  @Index()
  @ManyToOne(() => OrderLine, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_line_id' })
  orderLine!: OrderLine;

  @Column({ type: 'int', default: 1 })
  qty!: number;
}
