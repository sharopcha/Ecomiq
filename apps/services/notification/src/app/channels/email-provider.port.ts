import { ChannelSendResult } from './channel-provider.types';

/**
 * Provider-agnostic abstraction (mirrors payment-service's
 * `PaymentProviderPort` discipline): the only file allowed to know what
 * "mock" (or later "ses"/"resend") means is the adapter registered against
 * this port (see `channels.module.ts`). `DispatchService` (Step 6) speaks
 * only this port's language for sending; `WebhooksController` (Step 8)
 * speaks it for verifying/parsing the provider's delivery-event webhook —
 * same split as `PaymentProviderPort`'s `verifyWebhookSignature`/
 * `parseWebhookEvent`. A real provider adapter later replaces the
 * signature scheme these two methods implement, not the webhook route
 * itself.
 *
 * Narrow `WebhookVerifyResult`/`ChannelSendResult` with `=== false` only —
 * repo rule: `tsconfig.base.json` doesn't set `strictNullChecks`.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

export type WebhookVerifyResult = { ok: true } | { ok: false; reason: string };

/** Normalized shape every provider's delivery-event webhook translates into — `WebhookDispatchService` only ever sees this, never a provider's raw payload. */
export interface EmailWebhookEvent {
  externalEventId: string;
  kind: 'delivered' | 'opened' | 'clicked' | 'bounced';
  providerMessageId: string;
  failureReason?: string;
}

export abstract class EmailProviderPort {
  abstract readonly name: string;

  abstract send(input: SendEmailInput): Promise<ChannelSendResult>;

  /** Verifies the raw webhook body against the provider's own signature scheme — must run on the exact bytes, before any JSON parsing (`webhooks.controller.ts` registers a raw-body route for this reason). */
  abstract verifyWebhookSignature(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): WebhookVerifyResult;

  abstract parseWebhookEvent(rawBody: Buffer): EmailWebhookEvent;
}
