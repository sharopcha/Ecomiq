/**
 * Runnable proof — boots the real Nest application context (real
 * `FilesService`/`FoldersService`, real Postgres + MinIO) and exercises
 * the File Library surface: list filters (folder/search/mime-prefix),
 * sort, get-with-downloadUrl, rename, move-to-folder, delete (object +
 * derivatives-prefix + row), bulk delete, and the folder-emptiness check
 * now covering files too.
 *
 * Uploads real bytes for each file via the same presign -> PUT -> complete
 * path `upload-demo.ts` exercises, rather than inserting rows directly —
 * every file here has a real MinIO object behind it, so delete's S3 side
 * is exercised for real, not just its DB side.
 *
 * Run:
 *   npm run media:file-library-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { ConflictException } from '@nestjs/common';
import { AppModule } from '../app/app.module';
import { FilesService } from '../app/files/files.service';
import { FoldersService } from '../app/folders/folders.service';
import { FileSortBy, SortDirection } from '../app/files/dto/find-files-query.dto';

async function uploadFile(
  files: FilesService,
  storeId: string,
  ownerId: string,
  name: string,
  mimeType: string,
  folderId?: string,
) {
  const body = `${name} — ${ulid()}`;
  const { fileId, uploadUrl } = await files.presign(storeId, {
    name,
    mimeType,
    declaredSizeBytes: Buffer.byteLength(body),
    folderId,
  });
  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body,
  });
  assert(putResponse.ok, `presigned PUT for ${name} failed: ${putResponse.status}`);
  return files.complete(storeId, fileId, ownerId, {
    name,
    mimeType,
    declaredSizeBytes: Buffer.byteLength(body),
    folderId,
  });
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const ownerId = `demo-user-${ulid()}`;
  const files = app.get(FilesService);
  const folders = app.get(FoldersService);

  console.log('[file-library-demo] uploading three files (two images, one PDF)...');
  const folder = await folders.create(storeId, { name: 'Product Photos' });
  const photoA = await uploadFile(files, storeId, ownerId, 'a-hero.png', 'image/png', folder.id);
  const photoB = await uploadFile(files, storeId, ownerId, 'b-hero.png', 'image/png', folder.id);
  const invoice = await uploadFile(files, storeId, ownerId, 'invoice.pdf', 'application/pdf');
  assert(photoA.folder?.id === folder.id, 'photoA should be filed under the folder');
  assert(invoice.folder == null, 'invoice should be unfoldered (store root)');

  console.log('[file-library-demo] folder is non-empty — delete must 409...');
  let folderDeleteRejected = false;
  try {
    await folders.remove(storeId, folder.id);
  } catch (err) {
    folderDeleteRejected = err instanceof ConflictException;
  }
  assert(folderDeleteRejected, 'deleting a folder that still contains files should 409');
  console.log('[file-library-demo] OK — FoldersService.remove now also counts files, not just subfolders.');

  console.log('[file-library-demo] list filters: folderId, mimePrefix, search...');
  const inFolder = await files.findAll(storeId, { folderId: folder.id, limit: 10 } as never);
  assert(inFolder.items.length === 2, `expected 2 files in folder, got ${inFolder.items.length}`);

  const pdfsOnly = await files.findAll(storeId, { mimePrefix: 'application/pdf', limit: 10 } as never);
  assert(
    pdfsOnly.items.length === 1 && pdfsOnly.items[0].id === invoice.id,
    'mimePrefix=application/pdf should return only the invoice',
  );

  const searched = await files.findAll(storeId, { search: 'hero', limit: 10 } as never);
  assert(searched.items.length === 2, `expected 2 files matching "hero", got ${searched.items.length}`);

  console.log('[file-library-demo] sort by name desc...');
  const sorted = await files.findAll(storeId, {
    limit: 10,
    sortBy: FileSortBy.Name,
    sortDir: SortDirection.Desc,
  } as never);
  assert(
    sorted.items[0].name === 'invoice.pdf',
    `expected invoice.pdf first sorting by name desc, got ${sorted.items[0].name}`,
  );
  console.log('[file-library-demo] OK — folder/mimePrefix/search filters and sort all confirmed.');

  console.log('[file-library-demo] get with downloadUrl...');
  const withUrl = await files.findOneWithDownloadUrl(storeId, photoA.id);
  assert(withUrl.downloadUrl.includes('X-Amz-Signature'), 'findOneWithDownloadUrl should return a real presigned GET URL');

  console.log('[file-library-demo] rename + move-to-folder...');
  const renamed = await files.rename(storeId, invoice.id, { name: 'invoice-2026.pdf' });
  assert(renamed.name === 'invoice-2026.pdf', 'rename should update name');
  const moved = await files.moveToFolder(storeId, invoice.id, { folderId: folder.id });
  assert(moved.folder?.id === folder.id, 'moveToFolder should set the folder');
  const movedBack = await files.moveToFolder(storeId, invoice.id, { folderId: null });
  assert(movedBack.folder == null, 'moveToFolder with folderId:null should clear the folder');

  console.log('[file-library-demo] delete photoB (object + row)...');
  await files.remove(storeId, photoB.id);
  const afterDelete = await files.findAll(storeId, { limit: 100 } as never);
  assert(!afterDelete.items.some((f) => f.id === photoB.id), 'deleted file should not appear in findAll');

  console.log('[file-library-demo] bulk delete the remaining two...');
  await files.removeMany(storeId, [photoA.id, invoice.id]);
  const afterBulk = await files.findAll(storeId, { limit: 100 } as never);
  assert(afterBulk.items.length === 0, `expected 0 files after bulk delete, got ${afterBulk.items.length}`);

  console.log('[file-library-demo] folder is empty again — delete should now succeed...');
  await folders.remove(storeId, folder.id);
  console.log('[file-library-demo] OK — folder deleted once actually empty.');

  console.log('[file-library-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[file-library-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[file-library-demo] FAILED:', err);
  process.exit(1);
});
