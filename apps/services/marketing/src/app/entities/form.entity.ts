import { Column, Entity } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

export enum FormStatus {
  Draft = 'draft',
  Active = 'active',
  Archived = 'archived',
}

/**
 * Form — `schema` is a JSON Schema (validated via `ajv`, see
 * `validate-form-submission.util.ts`) describing
 * the fields a storefront visitor's submission must satisfy. Only
 * `status: 'active'` forms accept public submissions
 * (`FormsService.submit()`) — draft/archived reject with a 404, same "don't
 * reveal whether a differently-scoped resource exists" reasoning as
 * `assertOwnedByStore`.
 */
@Entity('form')
export class Form extends TenantScopedEntity {
  @Column({ type: 'jsonb' })
  schema!: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: FormStatus,
    enumName: 'form_status',
    default: FormStatus.Draft,
  })
  status!: FormStatus;
}
