/**
 * Runnable proof — boots the real
 * Nest application context (real `FormsService`, Postgres via
 * `marketing_db`) and exercises: create a form, a valid submission gets
 * stored, an invalid one is rejected, and a draft (not yet active) form
 * rejects submissions with the same 404 a nonexistent form would.
 *
 * Run:
 *   npm run marketing:forms-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app/app.module';
import { FormsService } from '../app/forms/forms.service';
import { Form, FormStatus } from '../app/entities/form.entity';
import { FormSubmission } from '../app/entities/form-submission.entity';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[forms-demo] ASSERTION FAILED: ${message}`);
  }
}

const SCHEMA = {
  type: 'object',
  properties: {
    email: { type: 'string', minLength: 3 },
    name: { type: 'string', minLength: 1 },
  },
  required: ['email', 'name'],
  additionalProperties: false,
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${Date.now()}`;

  const forms = app.get(FormsService);
  const formRepo = app.get<Repository<Form>>(getRepositoryToken(Form));
  const submissionRepo = app.get<Repository<FormSubmission>>(getRepositoryToken(FormSubmission));

  console.log('[forms-demo] draft form rejects submissions (same 404 as a nonexistent form)...');
  const draftForm = await forms.create(storeId, { schema: SCHEMA });
  assert(draftForm.status === FormStatus.Draft, 'a new form should start in draft');
  try {
    await forms.submit(draftForm.id, { email: 'a@example.com', name: 'Ada' }, '127.0.0.1');
    throw new Error('expected a draft form to reject submissions, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'NotFoundException', 'expected a NotFoundException');
    console.log('[forms-demo] OK — draft form rejected the submission.');
  }

  console.log('[forms-demo] activating the form...');
  const active = await forms.update(storeId, draftForm.id, { status: FormStatus.Active });
  assert(active.status === FormStatus.Active, 'expected the form to be active');

  console.log('[forms-demo] valid submission is stored...');
  const submission = await forms.submit(active.id, { email: 'a@example.com', name: 'Ada' }, '127.0.0.1');
  assert(submission.data['email'] === 'a@example.com', 'expected the submitted data to be stored verbatim');
  const storedCount = await submissionRepo.count({ where: { form: { id: active.id } } });
  assert(storedCount === 1, `expected 1 stored submission, got ${storedCount}`);
  console.log('[forms-demo] OK — valid submission stored.');

  console.log('[forms-demo] invalid submission (missing required field) is rejected...');
  try {
    await forms.submit(active.id, { email: 'a@example.com' }, '127.0.0.1');
    throw new Error('expected a missing-required-field submission to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'BadRequestException', 'expected a BadRequestException');
    console.log('[forms-demo] OK — missing-required-field submission rejected.');
  }

  console.log('[forms-demo] invalid submission (unknown field) is rejected...');
  try {
    await forms.submit(active.id, { email: 'a@example.com', name: 'Ada', extra: 'nope' }, '127.0.0.1');
    throw new Error('expected an unknown-field submission to be rejected, but it succeeded');
  } catch (err) {
    assert(err instanceof Error && err.constructor.name === 'BadRequestException', 'expected a BadRequestException');
    console.log('[forms-demo] OK — unknown-field submission rejected.');
  }

  const finalCount = await submissionRepo.count({ where: { form: { id: active.id } } });
  assert(finalCount === 1, `expected still only 1 stored submission after the rejected attempts, got ${finalCount}`);

  console.log('[forms-demo] ALL CHECKS PASSED');
  await app.close();
}

main().catch((err) => {
  console.error('[forms-demo] FAILED:', err);
  process.exit(1);
});
