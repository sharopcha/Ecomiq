import { resolveS3Endpoint } from './s3-clients';

/**
 * The presign gotcha (ECOMIQ-MEDIA-PLAN.md §0), as a regression test:
 * internal and public clients must never resolve to the same env key,
 * and each must actually read the key it's supposed to. A refactor that
 * accidentally wires both factories to `MEDIA_S3_ENDPOINT` (or swaps
 * them) fails this test instead of only failing silently the moment
 * someone tries a presigned URL from a real browser.
 */
describe('resolveS3Endpoint', () => {
  const env = {
    MEDIA_S3_ENDPOINT: 'http://minio:9000',
    MEDIA_S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
  };

  it('resolves the internal endpoint from MEDIA_S3_ENDPOINT only', () => {
    expect(resolveS3Endpoint('internal', env)).toBe('http://minio:9000');
  });

  it('resolves the public endpoint from MEDIA_S3_PUBLIC_ENDPOINT only', () => {
    expect(resolveS3Endpoint('public', env)).toBe('http://localhost:9000');
  });

  it('internal and public resolve to different values when configured differently', () => {
    expect(resolveS3Endpoint('internal', env)).not.toBe(resolveS3Endpoint('public', env));
  });

  it('defaults both to http://localhost:9000 when unset (bare-metal dev, no compose network)', () => {
    expect(resolveS3Endpoint('internal', {})).toBe('http://localhost:9000');
    expect(resolveS3Endpoint('public', {})).toBe('http://localhost:9000');
  });

  it('ignores the other kind\'s env var — internal never falls back to MEDIA_S3_PUBLIC_ENDPOINT or vice versa', () => {
    expect(resolveS3Endpoint('internal', { MEDIA_S3_PUBLIC_ENDPOINT: 'http://localhost:9000' })).toBe(
      'http://localhost:9000', // its own default, not the public value
    );
    expect(resolveS3Endpoint('public', { MEDIA_S3_ENDPOINT: 'http://minio:9000' })).toBe(
      'http://localhost:9000', // its own default, not the internal value
    );
  });
});
