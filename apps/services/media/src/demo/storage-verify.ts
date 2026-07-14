/**
 * Live-verify the presign gotcha's fix, against the real running MinIO
 * container — boots the real Nest application context (real
 * `StorageService`, real S3 clients) and exercises the full presign →
 * direct-PUT → HEAD round trip a browser would actually do: get a
 * presigned PUT URL from the *host* process (this script runs outside
 * docker, same vantage point as a browser), `fetch` bytes straight to
 * MinIO with it (no media-service or gateway in the request path), then
 * confirm `head()` sees the object with the right size. Proves
 * `MEDIA_S3_PUBLIC_ENDPOINT` — not `MEDIA_S3_ENDPOINT` — is what
 * presigning actually uses; signing against the internal `minio:9000`
 * host would make this PUT fail from here exactly like it would from a
 * browser.
 *
 * Run:
 *   npm run media:storage-verify
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app/app.module';
import { StorageService } from '../app/storage/storage.service';
import { buildOriginalKey } from '../app/storage/key-layout';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storage = app.get(StorageService);

  const storeId = 'demo-store-storage-verify';
  const fileId = `verify-${Date.now()}`;
  const key = buildOriginalKey(storeId, fileId, 'hello world.txt');
  const body = `storage-verify smoke test — ${new Date().toISOString()}`;
  const contentType = 'text/plain';

  console.log(`[storage-verify] key: ${key}`);

  console.log('[storage-verify] requesting presigned PUT (public endpoint)...');
  const putUrl = await storage.putPresign(key, contentType);

  console.log('[storage-verify] PUT-ing bytes directly to MinIO via the presigned URL...');
  const putResponse = await fetch(putUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });
  assert(
    putResponse.ok,
    `presigned PUT failed: ${putResponse.status} ${await putResponse.text()} — if this 403s with a signature mismatch, MEDIA_S3_PUBLIC_ENDPOINT is probably wrong`,
  );
  console.log(`[storage-verify] OK — PUT returned ${putResponse.status}.`);

  console.log('[storage-verify] HEAD-ing the object via the internal client...');
  const head = await storage.head(key);
  assert(head !== null, 'HEAD returned null — object not visible right after a successful PUT');
  assert(
    head.sizeBytes === Buffer.byteLength(body),
    `size mismatch: expected ${Buffer.byteLength(body)}, got ${head.sizeBytes}`,
  );
  console.log(`[storage-verify] OK — HEAD sees ${head.sizeBytes} bytes, contentType=${head.contentType}.`);

  console.log('[storage-verify] requesting presigned GET and reading it back...');
  const getUrl = await storage.getPresign(key);
  const getResponse = await fetch(getUrl);
  assert(getResponse.ok, `presigned GET failed: ${getResponse.status}`);
  const readBack = await getResponse.text();
  assert(readBack === body, 'GET body did not round-trip the PUT body');
  console.log('[storage-verify] OK — presigned GET round-trips the exact bytes written.');

  console.log('[storage-verify] cleaning up...');
  await storage.delete(key);
  const afterDelete = await storage.head(key);
  assert(afterDelete === null, 'object still visible after delete()');
  console.log('[storage-verify] OK — delete() removed the object.');

  console.log('MATCH');
  await app.close();
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[storage-verify] FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
