import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';
import { Form } from './form.entity';

/**
 * One row per accepted public submission. Extends `BaseEntity` (id only),
 * not `TenantScopedEntity` — same
 * reasoning as `DiscountUsage`/`CampaignSend`: never updated after insert,
 * and `storeId` is recovered server-side from the found `Form` row, never
 * accepted from the (unauthenticated, storeId-less) caller —
 * `FormsService.submit()` is the only writer.
 */
@Entity('form_submission')
export class FormSubmission extends BaseEntity {
  @Index()
  @Column({ type: 'text', name: 'store_id' })
  storeId!: string;

  @Index()
  @ManyToOne(() => Form, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_id' })
  form!: Form;

  @Column({ type: 'jsonb' })
  data!: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'submitted_at', default: () => 'now()' })
  submittedAt!: Date;

  @Column({ type: 'text', name: 'source_ip', nullable: true })
  sourceIp?: string | null;
}
