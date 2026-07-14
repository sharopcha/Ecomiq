/**
 * Runnable proof — boots the real Nest application context (real
 * `FoldersService`, real Postgres via `media_db`) and exercises folder
 * CRUD + the tree-specific operations (move, cycle rejection, delete-if-
 * empty), same "boot the real app context, drive the real services"
 * pattern as purchasing's `suppliers-demo.ts`.
 *
 * Run:
 *   npm run media:folders-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { ConflictException } from '@nestjs/common';
import { AppModule } from '../app/app.module';
import { FoldersService } from '../app/folders/folders.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const folders = app.get(FoldersService);

  console.log('[folders-demo] create root + child...');
  const root = await folders.create(storeId, { name: 'Product Photos' });
  const child = await folders.create(storeId, { name: '2026 Summer', parentId: root.id });
  assert(child.parent?.id === root.id, 'child should be parented under root');

  console.log('[folders-demo] rename...');
  const renamed = await folders.rename(storeId, child.id, { name: '2026 Summer Collection' });
  assert(renamed.name === '2026 Summer Collection', 'rename should update name');

  console.log('[folders-demo] list children of root...');
  const rootChildren = await folders.findAll(storeId, { parentId: root.id, limit: 10 } as never);
  assert(rootChildren.items.length === 1 && rootChildren.items[0].id === child.id, 'root should list exactly its one child');

  console.log('[folders-demo] move a second root folder under child, then back to root...');
  const second = await folders.create(storeId, { name: 'Banners' });
  const moved = await folders.move(storeId, second.id, { parentId: child.id });
  assert(moved.parent?.id === child.id, 'second should now be parented under child');
  const movedBack = await folders.move(storeId, second.id, { parentId: null });
  assert(movedBack.parent == null, 'moving with parentId:null should return second to root');

  console.log('[folders-demo] cycle rejection: moving root under its own descendant must fail...');
  let cycleRejected = false;
  try {
    await folders.move(storeId, root.id, { parentId: child.id });
  } catch (err) {
    cycleRejected = err instanceof ConflictException;
  }
  assert(cycleRejected, 'moving root into its own descendant (child) should throw ConflictException');

  console.log('[folders-demo] cycle rejection: a folder cannot become its own parent...');
  let selfParentRejected = false;
  try {
    await folders.move(storeId, root.id, { parentId: root.id });
  } catch (err) {
    selfParentRejected = err instanceof ConflictException;
  }
  assert(selfParentRejected, 'moving root under itself should throw ConflictException');

  console.log('[folders-demo] delete-if-empty: non-empty folder must 409, empty one succeeds...');
  let nonEmptyRejected = false;
  try {
    await folders.remove(storeId, root.id);
  } catch (err) {
    nonEmptyRejected = err instanceof ConflictException;
  }
  assert(nonEmptyRejected, 'deleting root while it still has a child should throw ConflictException');

  await folders.remove(storeId, second.id);
  const afterDelete = await folders.findAll(storeId, { limit: 100 } as never);
  assert(
    !afterDelete.items.some((f) => f.id === second.id),
    'deleted folder should no longer appear in findAll',
  );

  console.log('[folders-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[folders-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[folders-demo] FAILED:', err);
  process.exit(1);
});
