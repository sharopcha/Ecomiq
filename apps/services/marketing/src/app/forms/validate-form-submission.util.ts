import Ajv from 'ajv';

export type ValidateFormSubmissionResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * Pure(-ish — `ajv.compile` is deterministic given the same schema, no
 * external state) validation of a public form submission's `data` against
 * the form's own stored JSON Schema. Whether unknown fields are rejected
 * is entirely up to the schema itself
 * (`additionalProperties: false`) — this util doesn't impose that globally,
 * same "the schema is the contract" reasoning as any generic JSON Schema
 * validator. `=== false` narrowing only (repo rule: no `strictNullChecks`).
 */
export function validateFormSubmission(
  schema: Record<string, unknown>,
  data: Record<string, unknown>,
): ValidateFormSubmissionResult {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (valid) {
    return { ok: true };
  }
  const errors = (validate.errors ?? []).map((err) => `${err.instancePath || '(root)'} ${err.message}`);
  return { ok: false, errors };
}
