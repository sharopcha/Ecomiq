/**
 * Demo seed data for media-service: a small folder tree, ~15 files spread
 * across every `file_source` value (real upload, mock Unsplash/Dropbox/
 * Google Drive/OneDrive imports, and one content_library import via a
 * direct URL), and two cached image-transform derivatives. Mirrors
 * purchasing/crm/marketing's `src/demo/seed.ts` conventions (boots the
 * real Nest app context, `--store=` arg, timestamp-suffixed unique values
 * so a rerun just adds a fresh set).
 *
 *   docker compose up -d postgres pulsar minio minio-init
 *   npm run media:seed
 *   npm run media:seed -- --store=my-demo-store   # pin a specific storeId
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { AppModule } from '../app/app.module';
import { FoldersService } from '../app/folders/folders.service';
import { FilesService } from '../app/files/files.service';
import { FileSource } from '../app/entities/file-asset.entity';
import {
  EXTERNAL_SOURCE_REGISTRY,
  ExternalSourceRegistry,
} from '../app/external-sources/external-source-registry.token';

function storeIdFromArgs(): string {
  const arg = process.argv.find((a) => a.startsWith('--store='));
  return arg ? arg.slice('--store='.length) : 'demo-store';
}

async function uploadOne(
  files: FilesService,
  storeId: string,
  ownerId: string,
  name: string,
  mimeType: string,
  // `Uint8Array<ArrayBuffer>`, not the bare `Buffer`/`Uint8Array` a
  // parameter annotation defaults to (`<ArrayBufferLike>`, the
  // ArrayBuffer|SharedArrayBuffer union) — the union-typed default doesn't
  // structurally satisfy fetch's `BodyInit`, unlike the concrete
  // `ArrayBuffer` a locally-inferred `const buf = await sharp(...)
  // .toBuffer()` gets. Every caller already passes a real Buffer backed by
  // a concrete ArrayBuffer, so this is just narrowing the annotation to
  // match reality, not a behavior change.
  bytes: Uint8Array<ArrayBuffer>,
  folderId?: string,
) {
  const { fileId, uploadUrl } = await files.presign(storeId, {
    name,
    mimeType,
    declaredSizeBytes: bytes.length,
    folderId,
  });
  const response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: bytes });
  if (!response.ok) {
    throw new Error(`[seed] presigned PUT for ${name} failed: ${response.status}`);
  }
  return files.complete(storeId, fileId, ownerId, { name, mimeType, declaredSizeBytes: bytes.length, folderId });
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = storeIdFromArgs();
  const ownerId = `seed-user-${Date.now()}`;
  console.log(`[seed] seeding media demo data for storeId=${storeId}`);

  const folders = app.get(FoldersService);
  const files = app.get(FilesService);
  const registry = app.get<ExternalSourceRegistry>(EXTERNAL_SOURCE_REGISTRY);

  console.log('[seed] folder tree...');
  const productPhotos = await folders.create(storeId, { name: 'Product Photos' });
  const summerCollection = await folders.create(storeId, {
    name: '2026 Summer Collection',
    parentId: productPhotos.id,
  });
  const banners = await folders.create(storeId, { name: 'Banners' });
  const documents = await folders.create(storeId, { name: 'Documents' });
  console.log(
    `[seed] OK — 4 folders (Product Photos > 2026 Summer Collection, Banners, Documents).`,
  );

  const created = [];

  console.log('[seed] uploads (source=upload) — 8 real images/PDFs...');
  for (let i = 0; i < 6; i++) {
    const png = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: (i * 40) % 255, g: (i * 80) % 255, b: (i * 120) % 255 },
      },
    })
      .png()
      .toBuffer();
    created.push(
      await uploadOne(
        files,
        storeId,
        ownerId,
        `product-photo-${i + 1}.png`,
        'image/png',
        png,
        i % 2 === 0 ? summerCollection.id : productPhotos.id,
      ),
    );
  }
  const pdfBytes = Buffer.from('%PDF-1.4 seed placeholder document');
  created.push(await uploadOne(files, storeId, ownerId, 'return-policy.pdf', 'application/pdf', pdfBytes, documents.id));
  created.push(await uploadOne(files, storeId, ownerId, 'warranty-terms.pdf', 'application/pdf', pdfBytes, documents.id));
  console.log(`[seed] OK — ${created.length} uploaded files.`);

  console.log('[seed] mock Unsplash imports (source=unsplash) — 3...');
  const unsplash = registry.get('unsplash');
  if (!unsplash) throw new Error('[seed] unsplash adapter should be registered');
  const unsplashCatalog = await unsplash.search('');
  for (const entry of unsplashCatalog.slice(0, 3)) {
    created.push(
      await files.importFile(storeId, ownerId, {
        source: FileSource.Unsplash,
        externalRef: entry.externalRef,
        folderId: banners.id,
      }),
    );
  }
  console.log(`[seed] OK — 3 Unsplash imports.`);

  console.log('[seed] mock cloud-picker imports (dropbox/google_drive/one_drive) — 1 each...');
  for (const source of ['dropbox', 'google_drive', 'one_drive'] as const) {
    const adapter = registry.get(source);
    if (!adapter) throw new Error(`[seed] ${source} adapter should be registered`);
    const [entry] = await adapter.search('');
    created.push(
      await files.importFile(storeId, ownerId, {
        source: source as FileSource,
        externalRef: entry.externalRef,
      }),
    );
  }
  console.log('[seed] OK — 3 cloud-picker imports.');

  console.log('[seed] content_library import (no adapter, direct URL) — 1...');
  const mirrorSource = created[0];
  const mirrorUrl = await files.getPublicDownloadUrl(mirrorSource.id);
  created.push(
    await files.importFile(storeId, ownerId, {
      source: FileSource.ContentLibrary,
      url: mirrorUrl,
      name: 'content-library-mirror.png',
    }),
  );
  console.log(`[seed] OK — ${created.length} files total.`);

  console.log('[seed] generating 2 cached image derivatives...');
  const imageFiles = created.filter((f) => f.mimeType.startsWith('image/'));
  await files.getImageRedirectUrl(storeId, imageFiles[0].id, { w: 100, h: 100, fit: 'cover' });
  await files.getImageRedirectUrl(storeId, imageFiles[1].id, { w: 400, h: 300, fit: 'contain' });
  console.log('[seed] OK — 2 derivatives cached.');

  console.log(
    `[seed] DONE — storeId=${storeId}: 4 folders, ${created.length} files (${imageFiles.length} images), 2 derivatives.`,
  );
  await app.close();
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
