/**
 * Runnable proof — boots the real Nest application context (real
 * `FilesService`, real Postgres + MinIO, real `sharp`) and exercises the
 * image-transform pipeline: first-hit generates and caches a derivative,
 * second-hit reuses it, non-image files 415, and oversized dimensions
 * clamp to `MEDIA_MAX_TRANSFORM_DIMENSION` rather than the requested size.
 *
 * Uploads a real 400x300 PNG generated with sharp itself (not a fixture
 * file) through the full presign/PUT/complete path, so the transform
 * pipeline runs against a real object in MinIO end to end.
 *
 * Run:
 *   npm run media:transform-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import sharp from 'sharp';
import { UnsupportedMediaTypeException } from '@nestjs/common';
import { AppModule } from '../app/app.module';
import { FilesService } from '../app/files/files.service';
import { StorageService } from '../app/storage/storage.service';
import { buildDerivedKey } from '../app/storage/key-layout';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const ownerId = `demo-user-${ulid()}`;
  const files = app.get(FilesService);
  const storage = app.get(StorageService);

  console.log('[transform-demo] uploading a real 400x300 PNG...');
  const png = await sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .png()
    .toBuffer();
  const { fileId, uploadUrl } = await files.presign(storeId, {
    name: 'banner.png',
    mimeType: 'image/png',
    declaredSizeBytes: png.length,
  });
  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: png,
  });
  assert(putResponse.ok, `presigned PUT failed: ${putResponse.status}`);
  const image = await files.complete(storeId, fileId, ownerId, {
    name: 'banner.png',
    mimeType: 'image/png',
    declaredSizeBytes: png.length,
  });

  console.log('[transform-demo] first-hit: generates and caches derived/<id>/100x100-cover.webp...');
  const derivedKey = buildDerivedKey(image.id, 100, 100, 'cover', 'webp');
  const beforeHead = await storage.head(derivedKey);
  assert(beforeHead === null, 'derivative should not exist before the first transform request');

  const firstUrl = await files.getImageRedirectUrl(storeId, image.id, { w: 100, h: 100, fit: 'cover' });
  assert(firstUrl.includes('X-Amz-Signature'), 'getImageRedirectUrl should return a real presigned URL');
  const afterFirstHead = await storage.head(derivedKey);
  assert(afterFirstHead !== null, 'derivative should exist in MinIO after the first transform request');
  assert(afterFirstHead?.contentType === 'image/webp', 'derivative content-type should be image/webp');

  const firstFetch = await fetch(firstUrl);
  assert(firstFetch.ok, `fetching the derivative failed: ${firstFetch.status}`);
  const firstBytes = Buffer.from(await firstFetch.arrayBuffer());
  const firstMeta = await sharp(firstBytes).metadata();
  assert(firstMeta.width === 100 && firstMeta.height === 100, `expected a 100x100 derivative, got ${firstMeta.width}x${firstMeta.height}`);
  console.log('[transform-demo] OK — real 100x100 webp derivative generated and stored.');

  console.log('[transform-demo] second-hit: reuses the cached derivative...');
  const beforeSecond = await storage.head(derivedKey);
  const secondUrl = await files.getImageRedirectUrl(storeId, image.id, { w: 100, h: 100, fit: 'cover' });
  const afterSecond = await storage.head(derivedKey);
  assert(
    beforeSecond?.sizeBytes === afterSecond?.sizeBytes,
    'second request should not have re-written the derivative (size should be identical)',
  );
  assert(secondUrl.includes('X-Amz-Signature'), 'second request should still return a valid presigned URL');
  console.log('[transform-demo] OK — cached derivative reused, not regenerated.');

  console.log('[transform-demo] dimension clamping...');
  const maxDimension = 2000; // MEDIA_MAX_TRANSFORM_DIMENSION default
  const clampedKey = buildDerivedKey(image.id, maxDimension, maxDimension, 'contain', 'webp');
  await files.getImageRedirectUrl(storeId, image.id, { w: 999999, h: 999999, fit: 'contain' });
  const clampedHead = await storage.head(clampedKey);
  assert(
    clampedHead !== null,
    `expected the clamped-dimension derivative key (${clampedKey}) to exist, not a 999999x999999 one`,
  );
  console.log(`[transform-demo] OK — w=999999,h=999999 clamped to ${maxDimension}x${maxDimension}.`);

  console.log('[transform-demo] non-image mime must 415...');
  const { fileId: pdfId, uploadUrl: pdfUploadUrl } = await files.presign(storeId, {
    name: 'doc.pdf',
    mimeType: 'application/pdf',
    declaredSizeBytes: 4,
  });
  await fetch(pdfUploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: '%PDF' });
  const pdf = await files.complete(storeId, pdfId, ownerId, {
    name: 'doc.pdf',
    mimeType: 'application/pdf',
    declaredSizeBytes: 4,
  });
  let rejected = false;
  try {
    await files.getImageRedirectUrl(storeId, pdf.id, { w: 100, h: 100, fit: 'cover' });
  } catch (err) {
    rejected = err instanceof UnsupportedMediaTypeException;
  }
  assert(rejected, 'transforming a non-image file should throw UnsupportedMediaTypeException (415)');
  console.log('[transform-demo] OK — non-image file rejected with 415.');

  console.log('[transform-demo] cleanup...');
  await files.remove(storeId, image.id);
  await files.remove(storeId, pdf.id);
  const afterCleanup = await storage.head(derivedKey);
  assert(afterCleanup === null, "delete() should have cleared the file's derived/<id>/ prefix too");
  console.log("[transform-demo] OK — delete() cleared the derivatives prefix along with the original.");

  console.log('[transform-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[transform-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[transform-demo] FAILED:', err);
  process.exit(1);
});
