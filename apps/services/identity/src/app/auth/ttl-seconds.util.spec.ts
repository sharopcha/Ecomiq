import { ttlToSeconds } from './ttl-seconds.util';

describe('ttlToSeconds', () => {
  it('converts seconds', () => {
    expect(ttlToSeconds('30s')).toBe(30);
  });

  it('converts minutes', () => {
    expect(ttlToSeconds('5m')).toBe(300);
  });

  it('converts hours', () => {
    expect(ttlToSeconds('1h')).toBe(3600);
  });

  it('converts days', () => {
    expect(ttlToSeconds('2d')).toBe(172800);
  });

  it('tolerates surrounding whitespace and a space before the unit', () => {
    expect(ttlToSeconds(' 5 m ')).toBe(300);
  });

  it('throws on an unsupported unit', () => {
    expect(() => ttlToSeconds('5w')).toThrow(/Unsupported TTL format/);
  });

  it('throws on a value with no unit', () => {
    expect(() => ttlToSeconds('300')).toThrow(/Unsupported TTL format/);
  });

  it('throws on jose-style compound expressions this util deliberately does not support', () => {
    expect(() => ttlToSeconds('1.5 hrs')).toThrow(/Unsupported TTL format/);
  });
});
