import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';
import { ReturnRequest } from './return-request.entity';

/**
 * Photo/video evidence attached to an RMA — `fileId` is a plain text
 * column: `file_asset` is owned by catalog/media, not order-service
 * (ADR-2, no cross-DB FK).
 */
@Entity('return_proof')
export class ReturnProof extends BaseEntity {
  @Index()
  @ManyToOne(() => ReturnRequest, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_id' })
  returnRequest!: ReturnRequest;

  @Column({ type: 'text', name: 'file_id' })
  fileId!: string;
}
