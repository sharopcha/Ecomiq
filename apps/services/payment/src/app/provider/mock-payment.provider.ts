import { createHmac, timingSafeEqual } from 'crypto';
import { ulid } from 'ulid';
import {
  CreateIntentInput,
  ExecuteRefundInput,
  PaymentProviderPort,
  ProviderCancelResult,
  ProviderIntentResult,
  ProviderRefundResult,
  ProviderWebhookEvent,
  WebhookVerifyResult,
} from './payment-provider.port';

/** Header the mock provider's HMAC signature travels in (real Stripe uses `stripe-signature`; this is the mock's own convention). */
export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

/**
 * Deterministic failure rule, shared with the webhook simulator: an
 * amountMinor ending in `99`, or an explicit `metadata.simulate === 'fail'`
 * flag, marks an intent/refund for a simulated failure. Pure function so
 * both `MockPaymentProvider` and `simulate-webhook.ts` can call it without
 * either importing the other.
 */
export function isDeterministicFailure(amountMinor: number, metadata?: Record<string, string>): boolean {
  if (metadata?.simulate === 'fail') return true;
  return Math.abs(amountMinor) % 100 === 99;
}

/** HMAC-SHA256 over the exact raw bytes — the same signature scheme `verifyWebhookSignature` checks, so the simulator and the real inbound webhook route exercise identical code. */
export function signMockWebhookBody(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function verifyMockSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expectedHex = signMockWebhookBody(rawBody, secret);
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(signature, 'hex');
  // Length check before timingSafeEqual — it throws (rather than returning
  // false) when buffer lengths differ, which a malformed/tampered signature
  // header would trigger constantly.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * In-memory/deterministic adapter — no real payment ever moves, no
 * external network call, no persistent state of its own (the `Payment` row
 * `PaymentsService` maintains is the actual source of truth for an
 * intent's lifecycle; this class only ever computes a result from its
 * inputs). Exists so the whole payment-service stack (intents, webhooks,
 * refunds, gRPC) can be built and demoed end-to-end before a real Stripe
 * account exists — a second adapter (`StripePaymentProvider`) implementing
 * the same port is a drop-in swap via `PAYMENT_PROVIDER=stripe`
 * (`provider.module.ts`), with zero changes to any code that only knows
 * the port.
 */
export class MockPaymentProvider extends PaymentProviderPort {
  readonly name = 'mock';

  constructor(private readonly webhookSecret: string) {
    super();
  }

  async createIntent(input: CreateIntentInput): Promise<ProviderIntentResult> {
    if (input.amountMinor <= 0) {
      return { ok: false, reason: 'INVALID_AMOUNT', message: 'amountMinor must be positive' };
    }
    return {
      ok: true,
      externalRef: `mock_pi_${ulid()}`,
      clientSecret: `mock_secret_${ulid()}`,
      status: 'requires_confirmation',
    };
  }

  async cancelIntent(_externalRef: string): Promise<ProviderCancelResult> {
    // The mock keeps no per-intent state of its own to check "already
    // canceled" against — PaymentsService.cancelIntent guards that via the
    // Payment row's own status before ever calling into the port.
    return { ok: true };
  }

  async executeRefund(input: ExecuteRefundInput): Promise<ProviderRefundResult> {
    if (isDeterministicFailure(input.amountMinor)) {
      return {
        ok: false,
        reason: 'PROVIDER_UNAVAILABLE',
        message: 'mock provider: deterministic refund failure (amount ends in 99)',
      };
    }
    return { ok: true, providerRef: `mock_re_${ulid()}` };
  }

  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string>): WebhookVerifyResult {
    const signature = headers[MOCK_SIGNATURE_HEADER] ?? headers[MOCK_SIGNATURE_HEADER.toLowerCase()];
    if (!verifyMockSignature(rawBody, signature, this.webhookSecret)) {
      return { ok: false, reason: 'invalid_signature' };
    }
    return { ok: true };
  }

  parseWebhookEvent(rawBody: Buffer): ProviderWebhookEvent {
    // The mock's "provider format" IS the normalized format — there's no
    // translation step, unlike a real Stripe adapter, which is the whole
    // point (Stripe's slot-in only has to fill in that translation, not
    // rebuild anything downstream).
    return JSON.parse(rawBody.toString('utf8')) as ProviderWebhookEvent;
  }
}
