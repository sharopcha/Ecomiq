import { isDestinationUnserviceable, MockCarrierProvider } from './mock-carrier.provider';

describe('isDestinationUnserviceable', () => {
  it('flags a postal code ending in 99', () => {
    expect(isDestinationUnserviceable('10099')).toBe(true);
    expect(isDestinationUnserviceable('99')).toBe(true);
  });

  it('does not flag other postal codes', () => {
    expect(isDestinationUnserviceable('10001')).toBe(false);
    expect(isDestinationUnserviceable('90210')).toBe(false);
  });

  it('does not flag a missing postal code', () => {
    expect(isDestinationUnserviceable(null)).toBe(false);
    expect(isDestinationUnserviceable(undefined)).toBe(false);
  });
});

describe('MockCarrierProvider.getRates', () => {
  const provider = new MockCarrierProvider();

  it('computes a total from the fixed per-carrier rate table', async () => {
    const result = await provider.getRates({
      carrier: 'usps',
      packages: [{ totalWeightKg: 1.5 }, { totalWeightKg: 0.5 }],
      destination: {},
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.totalMinor).toBe(1600); // (500+450) + (500+150)
    }
  });

  it('falls back to the default rate for an unrecognized carrier', async () => {
    const result = await provider.getRates({
      carrier: 'aramex',
      packages: [{ totalWeightKg: 1 }],
      destination: {},
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.totalMinor).toBe(950); // 600 + round(1*350)
    }
  });
});

describe('MockCarrierProvider.purchaseLabel', () => {
  const provider = new MockCarrierProvider();

  it('fails deterministically for a destination postal code ending in 99', async () => {
    const result = await provider.purchaseLabel({
      labelId: 'label-1',
      carrier: 'usps',
      packages: [{ totalWeightKg: 1 }],
      destination: { postalCode: '10099' },
    });
    expect(result.ok === false).toBe(true);
    if (result.ok === false) {
      expect(result.reason).toBe('DESTINATION_UNSERVICEABLE');
    }
  });

  it('succeeds otherwise, with a fabricated tracking number and label URL', async () => {
    const result = await provider.purchaseLabel({
      labelId: 'label-1',
      carrier: 'usps',
      packages: [{ totalWeightKg: 1 }],
      destination: { postalCode: '10001' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.trackingNumber).toMatch(/^TRK-/);
      expect(result.labelUrl).toMatch(/^https:\/\/mock-carrier\.local\/labels\//);
    }
  });
});
