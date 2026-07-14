import { backoffMs } from './backoff.util';

describe('backoffMs', () => {
  it('attempt 1 never exceeds baseMs', () => {
    for (let i = 0; i < 50; i++) {
      const ms = backoffMs(1, 1000, 60_000);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(1000);
    }
  });

  it('grows exponentially with attempt, before hitting the cap', () => {
    for (let i = 0; i < 50; i++) {
      expect(backoffMs(2, 1000, 60_000)).toBeLessThanOrEqual(2000);
      expect(backoffMs(3, 1000, 60_000)).toBeLessThanOrEqual(4000);
      expect(backoffMs(4, 1000, 60_000)).toBeLessThanOrEqual(8000);
    }
  });

  it('never exceeds maxMs even at a very high attempt count', () => {
    for (let i = 0; i < 50; i++) {
      const ms = backoffMs(20, 1000, 5000);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(5000);
    }
  });

  it('treats attempt 0 (or negative) the same as attempt 1', () => {
    for (let i = 0; i < 50; i++) {
      expect(backoffMs(0, 1000, 60_000)).toBeLessThanOrEqual(1000);
      expect(backoffMs(-3, 1000, 60_000)).toBeLessThanOrEqual(1000);
    }
  });
});
