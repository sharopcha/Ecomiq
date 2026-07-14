/**
 * Runnable proof — boots the real Nest application context (real
 * `FilesService`, the real adapter registry, real Postgres + MinIO) and
 * exercises search + import for both adapter-backed sources (mock
 * Unsplash, mock Dropbox) and the no-adapter direct-URL path
 * (content_library).
 *
 * Run:
 *   npm run media:external-sources-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { FilesService } from '../app/files/files.service';
import { FileSource } from '../app/entities/file-asset.entity';
import {
  EXTERNAL_SOURCE_REGISTRY,
  ExternalSourceRegistry,
} from '../app/external-sources/external-source-registry.token';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const ownerId = `demo-user-${ulid()}`;
  const files = app.get(FilesService);
  const registry = app.get<ExternalSourceRegistry>(EXTERNAL_SOURCE_REGISTRY);

  console.log('[external-sources-demo] mock Unsplash: full catalog + filtered search...');
  const unsplash = registry.get('unsplash');
  if (!unsplash) {
    throw new Error('unsplash adapter should be registered');
  }
  const allResults = await unsplash.search('');
  assert(allResults.length === 5, `expected 5 catalog entries, got ${allResults.length}`);
  const mountainResults = await unsplash.search('mountain');
  assert(
    mountainResults.length === 1 && mountainResults[0].name === 'mountain-lake.jpg',
    'searching "mountain" should return exactly mountain-lake.jpg',
  );
  console.log('[external-sources-demo] OK — Unsplash mock catalog and search filter confirmed.');

  console.log('[external-sources-demo] importing from Unsplash by externalRef...');
  const imported = await files.importFile(storeId, ownerId, {
    source: FileSource.Unsplash,
    externalRef: mountainResults[0].externalRef,
  });
  assert(imported.source === FileSource.Unsplash, 'imported file should carry source=unsplash');
  assert(imported.externalRef === mountainResults[0].externalRef, 'imported file should record the externalRef');
  assert(imported.mimeType === 'image/jpeg', 'imported Unsplash file should be image/jpeg');
  assert(imported.sizeBytes > 0, 'imported file should have real, non-zero bytes');
  console.log('[external-sources-demo] OK — real placeholder JPEG imported and stored.');

  console.log('[external-sources-demo] mock Dropbox: non-image manifest entry...');
  const dropbox = registry.get('dropbox');
  if (!dropbox) {
    throw new Error('dropbox adapter should be registered');
  }
  const dropboxResults = await dropbox.search('spec-sheet');
  assert(dropboxResults.length === 1 && dropboxResults[0].mimeType === 'application/pdf', 'dropbox search should find the spec-sheet PDF');
  const importedPdf = await files.importFile(storeId, ownerId, {
    source: FileSource.Dropbox,
    externalRef: dropboxResults[0].externalRef,
  });
  assert(importedPdf.mimeType === 'application/pdf', 'imported dropbox file should keep its declared PDF mime type');
  console.log('[external-sources-demo] OK — non-image mime type round-trips through the same import path.');

  console.log('[external-sources-demo] content_library: no adapter, caller-supplied URL...');
  assert(registry.get('content_library') === undefined, 'content_library must NOT have a registered adapter');
  const seed = await files.presign(storeId, {
    name: 'seed.png',
    mimeType: 'image/png',
    declaredSizeBytes: 4,
  });
  await fetch(seed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: 'seed' });
  const seedFile = await files.complete(storeId, seed.fileId, ownerId, {
    name: 'seed.png',
    mimeType: 'image/png',
    declaredSizeBytes: 4,
  });
  const seedDownloadUrl = await files.getPublicDownloadUrl(seedFile.id);
  const mirrored = await files.importFile(storeId, ownerId, {
    source: FileSource.ContentLibrary,
    url: seedDownloadUrl,
    name: 'mirrored-seed.png',
  });
  assert(mirrored.source === FileSource.ContentLibrary, 'mirrored file should carry source=content_library');
  assert(mirrored.externalRef == null, 'content_library import should have no externalRef');
  assert(mirrored.sizeBytes === seedFile.sizeBytes, 'mirrored file should have the same byte count as its source URL');
  console.log('[external-sources-demo] OK — content_library imported via a direct URL, no adapter involved.');

  console.log('[external-sources-demo] importing content_library without a url must fail...');
  let missingUrlRejected = false;
  try {
    await files.importFile(storeId, ownerId, { source: FileSource.ContentLibrary, name: 'x.png' });
  } catch {
    missingUrlRejected = true;
  }
  assert(missingUrlRejected, 'content_library import without url should be rejected');
  console.log('[external-sources-demo] OK — missing url rejected.');

  console.log('[external-sources-demo] cleanup...');
  await files.remove(storeId, imported.id);
  await files.remove(storeId, importedPdf.id);
  await files.remove(storeId, seedFile.id);
  await files.remove(storeId, mirrored.id);

  console.log('[external-sources-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[external-sources-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[external-sources-demo] FAILED:', err);
  process.exit(1);
});
