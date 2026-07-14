import { clampDimension, isValidFit } from './image-transform';

describe('isValidFit', () => {
  it('accepts "cover" and "contain"', () => {
    expect(isValidFit('cover')).toBe(true);
    expect(isValidFit('contain')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidFit('fill')).toBe(false);
    expect(isValidFit('')).toBe(false);
    expect(isValidFit('COVER')).toBe(false);
  });
});

describe('clampDimension', () => {
  const max = 2000;

  it('passes through a value within range, rounding to the nearest integer', () => {
    expect(clampDimension(500, max)).toBe(500);
    expect(clampDimension(500.4, max)).toBe(500);
    expect(clampDimension(500.6, max)).toBe(501);
  });

  it('clamps a value over the max down to the max, not up further', () => {
    expect(clampDimension(999999, max)).toBe(max);
  });

  it('clamps a non-positive or non-finite value down to 1, not up to the max', () => {
    expect(clampDimension(0, max)).toBe(1);
    expect(clampDimension(-100, max)).toBe(1);
    expect(clampDimension(Number.NaN, max)).toBe(1);
    expect(clampDimension(Infinity, max)).toBe(1);
  });

  it('allows exactly the max', () => {
    expect(clampDimension(max, max)).toBe(max);
  });
});
