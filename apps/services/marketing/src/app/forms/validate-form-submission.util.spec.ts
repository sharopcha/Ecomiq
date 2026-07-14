import { validateFormSubmission } from './validate-form-submission.util';

describe('validateFormSubmission', () => {
  const schema = {
    type: 'object',
    properties: {
      email: { type: 'string', minLength: 3 },
      name: { type: 'string', minLength: 1 },
    },
    required: ['email', 'name'],
    additionalProperties: false,
  };

  it('accepts data matching the schema', () => {
    const result = validateFormSubmission(schema, { email: 'a@example.com', name: 'Ada' });
    expect(result.ok).toBe(true);
  });

  it('rejects data missing a required field', () => {
    const result = validateFormSubmission(schema, { email: 'a@example.com' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.length).toBeGreaterThan(0);
  });

  it('rejects an unknown field the schema does not declare', () => {
    const result = validateFormSubmission(schema, {
      email: 'a@example.com',
      name: 'Ada',
      unexpectedField: 'nope',
    });
    expect(result.ok).toBe(false);
  });
});
