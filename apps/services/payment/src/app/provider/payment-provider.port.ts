/**
 * Provider-agnostic abstraction (a deliberate design constraint): the only
 * file allowed to know what "mock"
 * (or later "stripe") means is the adapter registered against this port
 * (see `provider.module.ts`). `PaymentsService`, controllers, consumers,
 * and outbox events speak only this port's language — never a provider's
 * own shape.
 *
 * All result types are discriminated unions on a literal `ok` field.
 * **Narrow with `=== false` only** (repo rule: `tsconfig.base.json` doesn't
 * set `strictNullChecks`, so `!result.ok` does not narrow the union —
 * confirmed against this exact pattern in inventory's
 * `reservation-grpc.controller.ts`).
 */

export interface CreateIntentInput {
  storeId: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

export type ProviderIntentResult =
  | {
      ok: true;
      externalRef: string;
      clientSecret: string;
      status: 'requires_confirmation' | 'succeeded';
    }
  | { ok: false; reason: 'INVALID_AMOUNT' | 'PROVIDER_UNAVAILABLE'; message: string };

export type ProviderCancelResult =
  | { ok: true }
  | { ok: false; reason: 'ALREADY_CANCELED' | 'NOT_FOUND' | 'PROVIDER_UNAVAILABLE'; message: string };

export interface ExecuteRefundInput {
  /** The `Payment.externalRef` this refund is executed against. */
  externalRef: string;
  amountMinor: number;
  reason?: string;
}

export type ProviderRefundResult =
  | { ok: true; providerRef: string }
  | { ok: false; reason: 'PROVIDER_UNAVAILABLE' | 'ALREADY_REFUNDED'; message: string };

export type WebhookVerifyResult = { ok: true } | { ok: false; reason: string };

/** Normalized shape every provider's webhook translates into — `WebhookDispatchService` only ever sees this, never a provider's raw payload. */
export interface ProviderWebhookEvent {
  externalEventId: string;
  kind: 'intent.succeeded' | 'intent.failed' | 'refund.succeeded' | 'refund.failed';
  externalRef: string;
  amountMinor?: number;
  failureReason?: string;
}

export abstract class PaymentProviderPort {
  abstract readonly name: string;

  abstract createIntent(input: CreateIntentInput): Promise<ProviderIntentResult>;

  abstract cancelIntent(externalRef: string): Promise<ProviderCancelResult>;

  abstract executeRefund(input: ExecuteRefundInput): Promise<ProviderRefundResult>;

  /** Verifies the raw webhook body against the provider's own signature scheme — must run on the exact bytes, before any JSON parsing (`webhooks.controller.ts` registers a raw-body route for this reason). */
  abstract verifyWebhookSignature(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): WebhookVerifyResult;

  abstract parseWebhookEvent(rawBody: Buffer): ProviderWebhookEvent;
}
