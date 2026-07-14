import { createHmac, timingSafeEqual } from 'crypto';

/** Header the mock carrier's HMAC signature travels in (a real carrier adapter uses its own convention). Mirrors payment's `MOCK_SIGNATURE_HEADER`/notification's `MOCK_EMAIL_SIGNATURE_HEADER`. */
export const TRACKING_SIGNATURE_HEADER = 'x-mock-tracking-signature';

/** HMAC-SHA256 over the exact raw bytes — same technique as every other mock webhook in this repo, so a simulator script and the real inbound route exercise identical code. */
export function signTrackingWebhookBody(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifyTrackingWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expectedHex = signTrackingWebhookBody(rawBody, secret);
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(signature, 'hex');
  // Length check before timingSafeEqual — it throws (rather than returning
  // false) when buffer lengths differ, which a malformed/tampered signature
  // header would trigger constantly.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
