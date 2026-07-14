/**
 * Pure `{{Variable_name}}` interpolation — exact-name match only (no
 * whitespace/case normalization beyond what the regex tolerates around the
 * braces). A variable with no matching key in `vars` is left in the output
 * exactly as written and reported in `missing`, rather than throwing —
 * Step 6's dispatch pipeline must never fail a send just because an event
 * payload didn't carry every variable a store's custom template happens to
 * reference.
 */

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export interface RenderedTemplate {
  subject: string;
  body: string;
  missing: string[];
}

function interpolate(text: string, vars: Record<string, string>, missing: Set<string>): string {
  return text.replace(VARIABLE_PATTERN, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return vars[name];
    }
    missing.add(name);
    return match;
  });
}

export function renderTemplate(
  template: { subject?: string | null; body?: string | null },
  vars: Record<string, string>,
): RenderedTemplate {
  const missing = new Set<string>();
  const subject = interpolate(template.subject ?? '', vars, missing);
  const body = interpolate(template.body ?? '', vars, missing);
  return { subject, body, missing: [...missing] };
}
