import { MoneyTransformer, formatMoney, fromMinorUnits, toMinorUnits } from './money';

describe('toMinorUnits', () => {
  it('converts a typical decimal amount', () => {
    expect(toMinorUnits(19.99)).toBe(1999);
  });

  it('converts a whole number', () => {
    expect(toMinorUnits(20)).toBe(2000);
  });

  it('rounds rather than truncates floating-point drift', () => {
    expect(toMinorUnits(19.999)).toBe(2000);
  });

  it('supports a custom decimals precision', () => {
    expect(toMinorUnits(1.2345, 3)).toBe(1235);
  });

  it('handles zero', () => {
    expect(toMinorUnits(0)).toBe(0);
  });
});

describe('fromMinorUnits', () => {
  it('converts minor units back to a decimal amount', () => {
    expect(fromMinorUnits(1999)).toBe(19.99);
  });

  it('round-trips with toMinorUnits for a well-behaved value', () => {
    expect(fromMinorUnits(toMinorUnits(42.5))).toBe(42.5);
  });

  it('supports a custom decimals precision', () => {
    expect(fromMinorUnits(1235, 3)).toBe(1.235);
  });
});

describe('formatMoney', () => {
  it('formats minor units as a localized currency string', () => {
    expect(formatMoney(1999)).toBe('$19.99');
  });

  it('formats zero', () => {
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('returns an em dash for null', () => {
    expect(formatMoney(null)).toBe('—');
  });

  it('returns an em dash for undefined', () => {
    expect(formatMoney(undefined)).toBe('—');
  });

  it('supports a different currency/locale', () => {
    expect(formatMoney(1999, 'EUR', 'de-DE')).toContain('19,99');
  });
});

describe('MoneyTransformer', () => {
  it('serializes a number to a string for the bigint column', () => {
    expect(MoneyTransformer.to(1999)).toBe('1999');
  });

  it('truncates a fractional value before serializing (defensive — callers should already pass integers)', () => {
    expect(MoneyTransformer.to(1999.7)).toBe('1999');
  });

  it('serializes null/undefined to null', () => {
    expect(MoneyTransformer.to(null)).toBeNull();
    expect(MoneyTransformer.to(undefined)).toBeNull();
  });

  it('deserializes a bigint string back to a number', () => {
    expect(MoneyTransformer.from('1999')).toBe(1999);
  });

  it('deserializes null to null', () => {
    expect(MoneyTransformer.from(null)).toBeNull();
  });
});
