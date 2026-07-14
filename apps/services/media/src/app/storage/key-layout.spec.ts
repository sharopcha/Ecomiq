import { buildDerivedKey, buildDerivedPrefix, buildOriginalKey, sanitizeFilename } from './key-layout';

describe('sanitizeFilename', () => {
  it('passes through a normal ASCII filename unchanged', () => {
    expect(sanitizeFilename('hero-image.png')).toBe('hero-image.png');
  });

  it('preserves Unicode letters and digits', () => {
    expect(sanitizeFilename('café-résumé-写真.jpg')).toBe('café-résumé-写真.jpg');
  });

  it('collapses path separators so a filename cannot escape its key prefix', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(sanitizeFilename('a/b\\c')).toBe('a_b_c');
  });

  it('collapses other unsafe characters to underscore', () => {
    expect(sanitizeFilename('file name?.txt')).toBe('file_name_.txt');
  });

  it('falls back to "file" for an empty or whitespace-only name', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename('   ')).toBe('file');
  });

  it('caps length at 200 characters', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeFilename(long).length).toBe(200);
  });
});

describe('buildOriginalKey', () => {
  it('matches the documented layout: stores/<storeId>/files/<fileId>/<sanitized-name>', () => {
    expect(buildOriginalKey('store-1', 'file-1', 'photo.png')).toBe(
      'stores/store-1/files/file-1/photo.png',
    );
  });

  it('sanitizes the filename component', () => {
    expect(buildOriginalKey('store-1', 'file-1', '../evil.png')).toBe(
      'stores/store-1/files/file-1/.._evil.png',
    );
  });
});

describe('buildDerivedKey', () => {
  it('matches the documented layout: derived/<fileId>/<w>x<h>-<fit>.<ext>', () => {
    expect(buildDerivedKey('file-1', 100, 200, 'cover', 'webp')).toBe(
      'derived/file-1/100x200-cover.webp',
    );
  });
});

describe('buildDerivedPrefix', () => {
  it('matches the prefix every buildDerivedKey for the same file falls under', () => {
    const fileId = 'file-1';
    const prefix = buildDerivedPrefix(fileId);
    expect(prefix).toBe('derived/file-1/');
    expect(buildDerivedKey(fileId, 50, 50, 'cover', 'webp').startsWith(prefix)).toBe(true);
    expect(buildDerivedKey(fileId, 200, 200, 'contain', 'webp').startsWith(prefix)).toBe(true);
  });
});
