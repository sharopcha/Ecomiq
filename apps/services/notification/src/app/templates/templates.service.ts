import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantScopedCrudService } from '@temp-nx/typeorm';
import { Repository } from 'typeorm';
import { EmailTemplate, TemplateKind } from '../entities/email-template.entity';
import { DEFAULT_TEMPLATES } from './default-templates';

export interface ResolvedTemplate {
  subject: string | null;
  body: string | null;
  templateId: string | null;
}

@Injectable()
export class TemplatesService extends TenantScopedCrudService<EmailTemplate> {
  protected readonly alias = 'email_template';

  constructor(@InjectRepository(EmailTemplate) repo: Repository<EmailTemplate>) {
    super(repo);
  }

  /**
   * The store's own template of this kind if one exists (oldest first, for
   * deterministic behavior when a store has more than one), else the
   * built-in default from `default-templates.ts` — used by Step 6's
   * `DispatchService` so an event-driven send never fails just because a
   * fresh store hasn't configured its own templates yet. `templateId: null`
   * signals "this came from the built-in default, not a real row" (nothing
   * to attribute a `send_log` row to).
   */
  async resolveTemplate(storeId: string, kind: TemplateKind): Promise<ResolvedTemplate> {
    const existing = await this.repo.findOne({
      where: { storeId, kind } as never,
      order: { createdAt: 'ASC' } as never,
    });
    if (existing) {
      return { subject: existing.subject, body: existing.body, templateId: existing.id };
    }
    const fallback = DEFAULT_TEMPLATES[kind];
    return { subject: fallback.subject, body: fallback.body, templateId: null };
  }
}
