import { MockWhatsAppProvider } from './mock-whatsapp.provider';

describe('MockWhatsAppProvider', () => {
  const provider = new MockWhatsAppProvider();

  it('succeeds for a normal recipient', async () => {
    const result = await provider.send({ to: '+15551234567', body: 'Hi' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerMessageId).toMatch(/^mock_wa_/);
    }
  });

  it('fails deterministically when the recipient ends in .fail', async () => {
    const result = await provider.send({ to: '+15551234567.fail', body: 'Hi' });
    expect(result.ok === false).toBe(true);
  });
});
