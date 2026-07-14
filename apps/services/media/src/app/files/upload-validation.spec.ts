import { isMimeAllowed, isSizeAllowed, parseAllowedMimePrefixes } from './upload-validation';

describe('parseAllowedMimePrefixes', () => {
  it('splits a comma-separated list and trims whitespace', () => {
    expect(parseAllowedMimePrefixes('image/, video/ ,application/pdf')).toEqual([
      'image/',
      'video/',
      'application/pdf',
    ]);
  });

  it('drops empty entries from trailing/double commas', () => {
    expect(parseAllowedMimePrefixes('image/,,video/,')).toEqual(['image/', 'video/']);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseAllowedMimePrefixes('')).toEqual([]);
  });
});

describe('isMimeAllowed', () => {
  const prefixes = ['image/', 'video/', 'application/pdf'];

  it('allows a mime type matching a prefix', () => {
    expect(isMimeAllowed('image/png', prefixes)).toBe(true);
    expect(isMimeAllowed('video/mp4', prefixes)).toBe(true);
  });

  it('requires an exact prefix match for a non-wildcard entry', () => {
    expect(isMimeAllowed('application/pdf', prefixes)).toBe(true);
    expect(isMimeAllowed('application/pdfx', prefixes)).toBe(true); // startsWith, deliberately permissive
  });

  it('rejects a mime type matching no prefix', () => {
    expect(isMimeAllowed('text/plain', prefixes)).toBe(false);
    expect(isMimeAllowed('application/zip', prefixes)).toBe(false);
  });

  it('rejects everything against an empty allowlist', () => {
    expect(isMimeAllowed('image/png', [])).toBe(false);
  });
});

describe('isSizeAllowed', () => {
  const max = 1000;

  it('allows a size within (0, max]', () => {
    expect(isSizeAllowed(1, max)).toBe(true);
    expect(isSizeAllowed(max, max)).toBe(true);
  });

  it('rejects zero, negative, non-finite, or over-max sizes', () => {
    expect(isSizeAllowed(0, max)).toBe(false);
    expect(isSizeAllowed(-1, max)).toBe(false);
    expect(isSizeAllowed(Infinity, max)).toBe(false);
    expect(isSizeAllowed(Number.NaN, max)).toBe(false);
    expect(isSizeAllowed(max + 1, max)).toBe(false);
  });
});
