/**
 * Shared result shape every channel port's `send()` returns — same
 * discriminated-union-on-`ok`-literal discipline as `PaymentProviderPort`.
 * Narrow with `=== false` only (repo rule: `tsconfig.base.json` doesn't set
 * `strictNullChecks`, so `!result.ok` does not narrow the union).
 */
export type ChannelSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; reason: string; message: string };
