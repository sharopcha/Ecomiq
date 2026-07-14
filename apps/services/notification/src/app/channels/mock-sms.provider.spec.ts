import { MockSmsProvider } from './mock-sms.provider';

describe('MockSmsProvider', () => {
  const provider = new MockSmsProvider();

  it('succeeds for a normal recipient', async () => {
    const result = await provider.send({ to: '+15551234567', body: 'Hi' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerMessageId).toMatch(/^mock_sms_/);
    }
  });

  it('fails deterministically when the recipient ends in .fail', async () => {
    const result = await provider.send({ to: '+15551234567.fail', body: 'Hi' });
    expect(result.ok === false).toBe(true);
  });
});
