import { AlertOperator } from '../entities/stock-alert.entity';
import { matchesAlert } from './matches-alert.util';

describe('matchesAlert', () => {
  describe('lower_than', () => {
    it('matches when value is below threshold', () => {
      expect(matchesAlert(4, 10, AlertOperator.LowerThan)).toBe(true);
    });

    it('does not match when value equals threshold', () => {
      expect(matchesAlert(10, 10, AlertOperator.LowerThan)).toBe(false);
    });

    it('does not match when value is above threshold', () => {
      expect(matchesAlert(11, 10, AlertOperator.LowerThan)).toBe(false);
    });
  });

  describe('greater_than', () => {
    it('matches when value is above threshold', () => {
      expect(matchesAlert(11, 10, AlertOperator.GreaterThan)).toBe(true);
    });

    it('does not match when value equals threshold', () => {
      expect(matchesAlert(10, 10, AlertOperator.GreaterThan)).toBe(false);
    });

    it('does not match when value is below threshold', () => {
      expect(matchesAlert(4, 10, AlertOperator.GreaterThan)).toBe(false);
    });
  });

  describe('equals', () => {
    it('matches when value equals threshold exactly', () => {
      expect(matchesAlert(10, 10, AlertOperator.Equals)).toBe(true);
    });

    it('does not match when value differs from threshold at all', () => {
      expect(matchesAlert(9, 10, AlertOperator.Equals)).toBe(false);
      expect(matchesAlert(11, 10, AlertOperator.Equals)).toBe(false);
    });
  });

  it('a fresh-crossing check (matchesAlert(before) vs matchesAlert(after)) only flips once a threshold is crossed', () => {
    // Simulates the caller pattern in checkAndPublishLowStockAlerts: a movement
    // takes available from 12 -> 8 against a lower_than 10 alert.
    const wasMatching = matchesAlert(12, 10, AlertOperator.LowerThan);
    const isMatching = matchesAlert(8, 10, AlertOperator.LowerThan);
    expect(wasMatching).toBe(false);
    expect(isMatching).toBe(true);
  });
});
