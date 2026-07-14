/**
 * Runnable proof — boots the real Nest application context (real
 * `FilesService`, real Postgres + MinIO) and exercises the public-serving
 * resolution path: `findPublicAsset`/`getPublicDownloadUrl`/
 * `getPublicImageRedirectUrl` all take an id with **no store context**,
 * proving the store is resolved from the row itself rather than requiring
 * a caller-supplied one. The HTTP-level proof that these routes actually
 * bypass the gateway/service's JWT guard (not just that the service
 * methods are callable without a storeId) is a separate live `curl`
 * check — see the media-plan Step 8 session notes, not this script.
 *
 * Run:
 *   npm run media:public-serving-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import sharp from 'sharp';
import { NotFoundException } from '@nestjs/common';
import { AppModule } from '../app/app.module';
import { FilesService } from '../app/files/files.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const ownerId = `demo-user-${ulid()}`;
  const files = app.get(FilesService);

  console.log('[public-serving-demo] uploading a real image...');
  // Real PNG bytes, not a text stand-in — getPublicImageRedirectUrl runs
  // this through sharp for real, which (correctly) rejects anything that
  // isn't actual image data.
  const body = await sharp({
    create: { width: 60, height: 40, channels: 3, background: { r: 10, g: 200, b: 10 } },
  })
    .png()
    .toBuffer();
  const { fileId, uploadUrl } = await files.presign(storeId, {
    name: 'public.png',
    mimeType: 'image/png',
    declaredSizeBytes: body.length,
  });
  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body,
  });
  assert(putResponse.ok, `presigned PUT failed: ${putResponse.status}`);
  const file = await files.complete(storeId, fileId, ownerId, {
    name: 'public.png',
    mimeType: 'image/png',
    declaredSizeBytes: body.length,
  });

  console.log('[public-serving-demo] findPublicAsset resolves with no store context...');
  const publicAsset = await files.findPublicAsset(file.id);
  assert(publicAsset.storeId === storeId, "resolved asset's storeId should match the store it was uploaded under");
  console.log("[public-serving-demo] OK — the file's own storeId came back without the caller ever supplying one.");

  console.log('[public-serving-demo] getPublicDownloadUrl round-trips the real bytes...');
  const downloadUrl = await files.getPublicDownloadUrl(file.id);
  const getResponse = await fetch(downloadUrl);
  assert(getResponse.ok, `public download URL failed: ${getResponse.status}`);
  const readBack = Buffer.from(await getResponse.arrayBuffer());
  assert(readBack.equals(body), 'public download should return the exact uploaded bytes');
  console.log('[public-serving-demo] OK — public download URL serves the real object.');

  console.log('[public-serving-demo] getPublicImageRedirectUrl generates a real derivative...');
  const imageUrl = await files.getPublicImageRedirectUrl(file.id, { w: 50, h: 50, fit: 'cover' });
  const imageResponse = await fetch(imageUrl);
  assert(imageResponse.ok, `public image transform URL failed: ${imageResponse.status}`);
  console.log('[public-serving-demo] OK — public image transform serves a real webp derivative.');

  console.log('[public-serving-demo] a nonexistent id must 404, not leak store info...');
  let notFound = false;
  try {
    await files.findPublicAsset(`nonexistent-${ulid()}`);
  } catch (err) {
    notFound = err instanceof NotFoundException;
  }
  assert(notFound, 'findPublicAsset on a nonexistent id should throw NotFoundException');
  console.log('[public-serving-demo] OK — nonexistent id 404s cleanly.');

  console.log('[public-serving-demo] cleanup...');
  await files.remove(storeId, file.id);

  console.log('[public-serving-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[public-serving-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[public-serving-demo] FAILED:', err);
  process.exit(1);
});
