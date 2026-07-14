/**
 * Exponential backoff with full jitter (AWS's "full jitter" algorithm) —
 * attempt N's delay is a uniform random pick in `[0, min(maxMs, baseMs *
 * 2^(N-1))]`, so many simultaneously failing sends don't all wake up and
 * hammer the provider at the exact same instant. Pure function of its
 * inputs (no env reads, no clock reads) — the caller (`DispatchService`)
 * resolves `baseMs`/`maxMs` from config and passes them in, keeping this
 * testable via plain range assertions.
 */
export function backoffMs(attempt: number, baseMs: number, maxMs: number): number {
  const exponent = Math.max(0, attempt - 1);
  const cap = Math.min(maxMs, baseMs * 2 ** exponent);
  return Math.floor(Math.random() * cap);
}
