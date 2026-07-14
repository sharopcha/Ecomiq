/**
 * Runnable proof — boots the real Nest application context (real
 * `TemplatesService`, real Postgres via `notification_db`) and exercises
 * CRUD plus `resolveTemplate()`'s store-template-or-built-in-default
 * fallback, same "boot the real app context, drive the real services"
 * pattern as catalog/payment's own demo scripts.
 *
 * Run:
 *   npm run notification:templates-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { TemplatesService } from '../app/templates/templates.service';
import { TemplateKind } from '../app/entities/email-template.entity';
import { DEFAULT_TEMPLATES } from '../app/templates/default-templates';
import { renderTemplate } from '../app/templates/render-template.util';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const templates = app.get(TemplatesService);

  console.log('[templates-demo] resolveTemplate() on a fresh store falls back to the built-in default...');
  const beforeCreate = await templates.resolveTemplate(storeId, TemplateKind.Refund);
  assert(beforeCreate.templateId === null, 'fresh store should have no template row, templateId null');
  assert(beforeCreate.subject === DEFAULT_TEMPLATES[TemplateKind.Refund].subject, 'should return the built-in default subject');
  console.log('[templates-demo] OK — built-in default returned.');

  console.log('[templates-demo] creating a custom refund template...');
  const created = await templates.create(storeId, {
    kind: TemplateKind.Refund,
    name: 'Custom refund email',
    subject: 'Refund for {{Order_ID}} is on its way',
    body: '<p>Hi {{Customer_name}}, your refund for {{Order_ID}} from {{Store_name}} is processed.</p>',
  });
  assert(created.id.length > 0, 'created template should have an id');

  console.log('[templates-demo] resolveTemplate() now returns the store\'s own template...');
  const afterCreate = await templates.resolveTemplate(storeId, TemplateKind.Refund);
  assert(afterCreate.templateId === created.id, 'should now resolve to the just-created row');
  assert(afterCreate.subject === created.subject, 'subject should match the store template, not the default');
  console.log('[templates-demo] OK — store template takes precedence over the built-in default.');

  console.log('[templates-demo] rendering the resolved template with a partial variable set...');
  const rendered = renderTemplate(afterCreate, {
    Order_ID: '1042',
    Customer_name: 'Ada',
    // Store_name deliberately omitted to exercise the missing[] path.
  });
  assert(rendered.subject === 'Refund for 1042 is on its way', `unexpected subject: ${rendered.subject}`);
  assert(rendered.body.includes('Hi Ada'), 'body should have Customer_name interpolated');
  assert(rendered.body.includes('{{Store_name}}'), 'unresolved Store_name should be left literal');
  assert(rendered.missing.includes('Store_name'), 'Store_name should be reported as missing');
  console.log('[templates-demo] OK — rendered with one variable correctly left literal + reported missing.');

  console.log('[templates-demo] listing + updating + removing...');
  const list = await templates.findAll(storeId, { limit: 10 } as never);
  assert(list.items.some((t) => t.id === created.id), 'findAll should include the created template');

  const updated = await templates.update(storeId, created.id, { name: 'Renamed refund email' });
  assert(updated.name === 'Renamed refund email', 'update should persist the new name');

  await templates.remove(storeId, created.id);
  const afterRemove = await templates.resolveTemplate(storeId, TemplateKind.Refund);
  assert(afterRemove.templateId === null, 'after removal, resolveTemplate should fall back to the default again');
  console.log('[templates-demo] OK — remove + fallback confirmed.');

  console.log('[templates-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[templates-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[templates-demo] FAILED:', err);
  process.exit(1);
});
