import { isDeterministicFailure, MOCK_SIGNATURE_HEADER, MockPaymentProvider, signMockWebhookBody } from './mock-payment.provider';

describe('isDeterministicFailure', () => {
  it('flags an amount ending in 99', () => {
    expect(isDeterministicFailure(1099)).toBe(true);
    expect(isDeterministicFailure(9999)).toBe(true);
  });

  it('does not flag other amounts', () => {
    expect(isDeterministicFailure(1000)).toBe(false);
    expect(isDeterministicFailure(1)).toBe(false);
  });

  it('flags an explicit simulate:fail metadata flag regardless of amount', () => {
    expect(isDeterministicFailure(1000, { simulate: 'fail' })).toBe(true);
  });

  it('ignores unrelated metadata', () => {
    expect(isDeterministicFailure(1000, { note: 'gift' })).toBe(false);
  });
});

describe('MockPaymentProvider.verifyWebhookSignature', () => {
  const secret = 'test-secret';
  const provider = new MockPaymentProvider(secret);

  it('accepts a correctly signed body', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    const signature = signMockWebhookBody(body, secret);
    const result = provider.verifyWebhookSignature(body, { [MOCK_SIGNATURE_HEADER]: signature });
    expect(result.ok).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    const signature = signMockWebhookBody(body, secret);
    const tampered = Buffer.from(JSON.stringify({ hello: 'mallory' }));
    const result = provider.verifyWebhookSignature(tampered, { [MOCK_SIGNATURE_HEADER]: signature });
    expect(result.ok === false).toBe(true);
  });

  it('rejects a missing signature header', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    const result = provider.verifyWebhookSignature(body, {});
    expect(result.ok === false).toBe(true);
  });

  it('rejects a signature from the wrong secret', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    const wrongSignature = signMockWebhookBody(body, 'different-secret');
    const result = provider.verifyWebhookSignature(body, {
      [MOCK_SIGNATURE_HEADER]: wrongSignature,
    });
    expect(result.ok === false).toBe(true);
  });
});

describe('MockPaymentProvider.createIntent', () => {
  const provider = new MockPaymentProvider('secret');

  it('succeeds for a positive amount', async () => {
    const result = await provider.createIntent({
      storeId: 's1',
      orderId: 'o1',
      amountMinor: 1000,
      currency: 'USD',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a non-positive amount', async () => {
    const result = await provider.createIntent({
      storeId: 's1',
      orderId: 'o1',
      amountMinor: 0,
      currency: 'USD',
    });
    expect(result.ok === false).toBe(true);
  });
});

describe('MockPaymentProvider.executeRefund', () => {
  const provider = new MockPaymentProvider('secret');

  it('fails deterministically for an amount ending in 99', async () => {
    const result = await provider.executeRefund({ externalRef: 'mock_pi_x', amountMinor: 1099 });
    expect(result.ok === false).toBe(true);
  });

  it('succeeds otherwise', async () => {
    const result = await provider.executeRefund({ externalRef: 'mock_pi_x', amountMinor: 1000 });
    expect(result.ok).toBe(true);
  });
});
