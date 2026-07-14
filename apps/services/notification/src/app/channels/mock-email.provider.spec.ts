import { MOCK_EMAIL_SIGNATURE_HEADER, MockEmailProvider, signMockEmailWebhookBody } from './mock-email.provider';

describe('MockEmailProvider', () => {
  const provider = new MockEmailProvider('test-secret');

  it('succeeds for a normal recipient', async () => {
    const result = await provider.send({ to: 'ada@example.com', subject: 'Hi', body: 'Body' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerMessageId).toMatch(/^mock_email_/);
    }
  });

  it('fails deterministically when the local-part ends in .fail', async () => {
    const result = await provider.send({ to: 'ada.fail@example.com', subject: 'Hi', body: 'Body' });
    expect(result.ok === false).toBe(true);
  });

  it('does not trip the failure trigger for an unrelated local-part', async () => {
    const result = await provider.send({ to: 'failsafe@example.com', subject: 'Hi', body: 'Body' });
    expect(result.ok).toBe(true);
  });
});

describe('MockEmailProvider webhook verification', () => {
  const secret = 'webhook-secret';
  const provider = new MockEmailProvider(secret);

  it('accepts a correctly signed body', () => {
    const body = Buffer.from(JSON.stringify({ externalEventId: 'evt_1', kind: 'opened', providerMessageId: 'mock_email_1' }));
    const signature = signMockEmailWebhookBody(body, secret);
    const result = provider.verifyWebhookSignature(body, { [MOCK_EMAIL_SIGNATURE_HEADER]: signature });
    expect(result.ok).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = Buffer.from(JSON.stringify({ externalEventId: 'evt_1', kind: 'opened' }));
    const signature = signMockEmailWebhookBody(body, secret);
    const tampered = Buffer.from(JSON.stringify({ externalEventId: 'evt_1', kind: 'bounced' }));
    const result = provider.verifyWebhookSignature(tampered, { [MOCK_EMAIL_SIGNATURE_HEADER]: signature });
    expect(result.ok === false).toBe(true);
  });

  it('rejects a missing signature header', () => {
    const body = Buffer.from(JSON.stringify({ externalEventId: 'evt_1', kind: 'opened' }));
    const result = provider.verifyWebhookSignature(body, {});
    expect(result.ok === false).toBe(true);
  });

  it('rejects a signature from the wrong secret', () => {
    const body = Buffer.from(JSON.stringify({ externalEventId: 'evt_1', kind: 'opened' }));
    const wrongSignature = signMockEmailWebhookBody(body, 'different-secret');
    const result = provider.verifyWebhookSignature(body, { [MOCK_EMAIL_SIGNATURE_HEADER]: wrongSignature });
    expect(result.ok === false).toBe(true);
  });

  it('parses the webhook body as the normalized event shape', () => {
    const body = Buffer.from(JSON.stringify({ externalEventId: 'evt_1', kind: 'bounced', providerMessageId: 'mock_email_1', failureReason: 'mailbox full' }));
    const event = provider.parseWebhookEvent(body);
    expect(event).toEqual({ externalEventId: 'evt_1', kind: 'bounced', providerMessageId: 'mock_email_1', failureReason: 'mailbox full' });
  });
});
