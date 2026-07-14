import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedCrudService } from '@temp-nx/typeorm';
import { Form, FormStatus } from '../entities/form.entity';
import { FormSubmission } from '../entities/form-submission.entity';
import { validateFormSubmission } from './validate-form-submission.util';

@Injectable()
export class FormsService extends TenantScopedCrudService<Form> {
  protected readonly alias = 'form';

  constructor(
    @InjectRepository(Form) repo: Repository<Form>,
    @InjectRepository(FormSubmission) private readonly submissionRepo: Repository<FormSubmission>,
  ) {
    super(repo);
  }

  /**
   * Public entry point — no `storeId` parameter: the caller is an
   * unauthenticated storefront visitor with no
   * store context of their own. Resolves the target form purely from `id`
   * and recovers `storeId` from the found row (never from the caller).
   * Only `status: active` forms accept submissions — a draft/archived form
   * gets the same 404 a nonexistent id would, so a caller can't tell "wrong
   * id" apart from "not accepting submissions right now".
   */
  async submit(formId: string, data: Record<string, unknown>, sourceIp?: string): Promise<FormSubmission> {
    const form = await this.repo.findOneBy({ id: formId });
    if (!form || form.status !== FormStatus.Active) {
      throw new NotFoundException(`Form ${formId} not found`);
    }

    const result = validateFormSubmission(form.schema, data);
    if (result.ok === false) {
      throw new BadRequestException({
        message: 'Submission does not match the form schema',
        errors: result.errors,
      });
    }

    const submission = this.submissionRepo.create({
      storeId: form.storeId,
      form,
      data,
      sourceIp: sourceIp ?? null,
    });
    return this.submissionRepo.save(submission);
  }
}
