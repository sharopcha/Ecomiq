/**
 * Deterministic failure trigger shared by every mock channel adapter — same
 * "test hook baked into the mock, not real provider flakiness" pattern as
 * payment's amount-ends-99 (`isDeterministicFailure`). Step 6's retry/DLQ
 * path needs a reliable way to force a send down the failure path without
 * depending on anything random.
 */

/** Email: the local-part (before `@`) ends in the literal suffix `.fail`. */
export function isDeterministicEmailFailure(to: string): boolean {
  const localPart = to.split('@')[0] ?? '';
  return localPart.endsWith('.fail');
}

/** SMS/WhatsApp: the recipient value itself ends in the literal suffix `.fail` — a synthetic test convention, not a real phone number shape. */
export function isDeterministicRecipientFailure(to: string): boolean {
  return to.endsWith('.fail');
}
