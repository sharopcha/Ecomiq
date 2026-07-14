import { S3Client } from '@aws-sdk/client-s3';

export const MEDIA_S3_INTERNAL_CLIENT = Symbol('MEDIA_S3_INTERNAL_CLIENT');
export const MEDIA_S3_PUBLIC_CLIENT = Symbol('MEDIA_S3_PUBLIC_CLIENT');

export interface S3ClientConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * The presign gotcha (ECOMIQ-MEDIA-PLAN.md §0), made structural rather than
 * a config value someone has to remember: two separate `S3Client`
 * instances, never one client with a runtime-swapped endpoint.
 *
 * - Internal (`MEDIA_S3_ENDPOINT`, e.g. `http://minio:9000` inside
 *   docker-compose): every SDK operation media-service issues itself
 *   (put/head/delete/list) — never sees the outside world, so it can use
 *   whatever address is actually reachable from the container.
 * - Public (`MEDIA_S3_PUBLIC_ENDPOINT`, e.g. `http://localhost:9000`):
 *   used *only* to construct the client that `getSignedUrl` presigns
 *   against, because a presigned URL's signature is computed over the
 *   host in the request — sign against `minio:9000` and the URL 404s the
 *   moment a browser (which can't resolve `minio`) tries to use it.
 *
 * `forcePathStyle: true` is a MinIO requirement (it doesn't support
 * virtual-hosted-style bucket addressing the way AWS S3 does).
 */
export function createS3Client(config: S3ClientConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export interface S3EndpointEnv {
  MEDIA_S3_ENDPOINT?: string;
  MEDIA_S3_PUBLIC_ENDPOINT?: string;
}

/**
 * The gotcha's actual decision, pulled out as a pure function so it has a
 * regression test independent of NestJS DI/ConfigService —
 * `StorageModule`'s two client factories call this for the one field that
 * differs between them (`endpoint`); everything else (region, credentials)
 * is shared and stays inline in the module. A future refactor that
 * accidentally wires both factories to the same env key fails a test
 * instead of only failing silently at demo time.
 */
export function resolveS3Endpoint(kind: 'internal' | 'public', env: S3EndpointEnv): string {
  if (kind === 'internal') {
    return env.MEDIA_S3_ENDPOINT ?? 'http://localhost:9000';
  }
  return env.MEDIA_S3_PUBLIC_ENDPOINT ?? 'http://localhost:9000';
}
