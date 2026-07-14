import { signTrackingWebhookBody, verifyTrackingWebhookSignature } from './signature.util';

describe('verifyTrackingWebhookSignature', () => {
  const secret = 'test-secret';

  it('accepts a correctly signed body', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    const signature = signTrackingWebhookBody(body, secret);
    expect(verifyTrackingWebhookSignature(body, signature, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    const signature = signTrackingWebhookBody(body, secret);
    const tampered = Buffer.from(JSON.stringify({ hello: 'mallory' }));
    expect(verifyTrackingWebhookSignature(tampered, signature, secret)).toBe(false);
  });

  it('rejects a missing signature', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    expect(verifyTrackingWebhookSignature(body, undefined, secret)).toBe(false);
  });

  it('rejects a signature from the wrong secret', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    const wrongSignature = signTrackingWebhookBody(body, 'different-secret');
    expect(verifyTrackingWebhookSignature(body, wrongSignature, secret)).toBe(false);
  });
});
