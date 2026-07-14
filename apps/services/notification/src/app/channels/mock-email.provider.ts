import { createHmac, timingSafeEqual } from 'crypto';
import { ulid } from 'ulid';
import { ChannelSendResult } from './channel-provider.types';
import { EmailProviderPort, EmailWebhookEvent, SendEmailInput, WebhookVerifyResult } from './email-provider.port';
import { isDeterministicEmailFailure } from './deterministic-failure.util';

/** Header the mock provider's HMAC signature travels in (a real SES/Resend adapter uses its own header; this is the mock's own convention, same pattern as payment's `MOCK_SIGNATURE_HEADER`). */
export const MOCK_EMAIL_SIGNATURE_HEADER = 'x-mock-email-signature';

/** HMAC-SHA256 over the exact raw bytes — same technique `signMockWebhookBody` uses in payment-service, so a simulator script and the real inbound webhook route exercise identical code. */
export function signMockEmailWebhookBody(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function verifyMockSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expectedHex = signMockEmailWebhookBody(rawBody, secret);
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(signature, 'hex');
  // Length check before timingSafeEqual — it throws (rather than returning
  // false) when buffer lengths differ, which a malformed/tampered signature
  // header would trigger constantly.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * No real email ever leaves the process — logs what a real SES/Resend
 * adapter would have sent and returns a fabricated `providerMessageId`,
 * same "compute a result from inputs, no external call" shape as
 * `MockPaymentProvider`. A real adapter implementing this same port is a
 * drop-in swap via `NOTIFICATION_EMAIL_PROVIDER` (`channels.module.ts`).
 */
export class MockEmailProvider extends EmailProviderPort {
  readonly name = 'mock';

  constructor(private readonly webhookSecret: string) {
    super();
  }

  async send(input: SendEmailInput): Promise<ChannelSendResult> {
    if (isDeterministicEmailFailure(input.to)) {
      // eslint-disable-next-line no-console
      console.log(
        `[EmailProviderPort:mock] FAILED send to=${input.to} subject=${JSON.stringify(input.subject)}`,
      );
      return {
        ok: false,
        reason: 'DETERMINISTIC_TEST_FAILURE',
        message: 'mock email provider: deterministic failure (recipient local-part ends in .fail)',
      };
    }
    const providerMessageId = `mock_email_${ulid()}`;
    // eslint-disable-next-line no-console
    console.log(
      `[EmailProviderPort:mock] SENT to=${input.to} subject=${JSON.stringify(input.subject)} -> ${providerMessageId}`,
    );
    return { ok: true, providerMessageId };
  }

  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string>): WebhookVerifyResult {
    const signature = headers[MOCK_EMAIL_SIGNATURE_HEADER] ?? headers[MOCK_EMAIL_SIGNATURE_HEADER.toLowerCase()];
    if (!verifyMockSignature(rawBody, signature, this.webhookSecret)) {
      return { ok: false, reason: 'invalid_signature' };
    }
    return { ok: true };
  }

  parseWebhookEvent(rawBody: Buffer): EmailWebhookEvent {
    // The mock's "provider format" IS the normalized format — no
    // translation step, unlike a real adapter (same shortcut
    // MockPaymentProvider takes).
    return JSON.parse(rawBody.toString('utf8')) as EmailWebhookEvent;
  }
}
