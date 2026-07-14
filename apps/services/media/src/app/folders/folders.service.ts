import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult, TenantScopedCrudService, paginate } from '@temp-nx/typeorm';
import { FileFolder } from '../entities/file-folder.entity';
import { FileAsset } from '../entities/file-asset.entity';
import { writeActivityLog } from '../common/activity-log.util';
import { wouldCreateCycle } from './folder-cycle';
import { CreateFolderDto } from './dto/create-folder.dto';
import { RenameFolderDto } from './dto/rename-folder.dto';
import { MoveFolderDto } from './dto/move-folder.dto';
import { FindFoldersQueryDto } from './dto/find-folders-query.dto';

const SUBJECT_TABLE = 'file';

@Injectable()
export class FoldersService extends TenantScopedCrudService<FileFolder> {
  protected readonly alias = 'file_folder';

  constructor(@InjectRepository(FileFolder) repo: Repository<FileFolder>) {
    super(repo);
  }

  /** Optional `?parentId=` filter to browse one level of the tree — omitted lists the whole store flat. */
  override async findAll(
    storeId: string,
    query: FindFoldersQueryDto,
  ): Promise<PaginatedResult<FileFolder>> {
    const qb = this.repo
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.store_id = :storeId`, { storeId });

    if (query.parentId) {
      qb.andWhere(`${this.alias}.parent_id = :parentId`, { parentId: query.parentId });
    }

    return paginate(qb, this.alias, query);
  }

  async create(storeId: string, dto: CreateFolderDto): Promise<FileFolder> {
    return this.repo.manager.transaction(async (manager) => {
      // 404s (via findOne's assertOwnedByStore) if parentId belongs to a
      // different store — the FK alone doesn't enforce tenant isolation,
      // only that the row exists somewhere.
      if (dto.parentId) {
        await this.findOne(storeId, dto.parentId);
      }

      const folder = manager.create(FileFolder, {
        storeId,
        name: dto.name,
        parent: dto.parentId ? ({ id: dto.parentId } as FileFolder) : null,
      });
      const saved = await manager.save(folder);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'folder.created',
        data: { name: saved.name, parentId: dto.parentId ?? null },
      });

      return saved;
    });
  }

  async rename(storeId: string, id: string, dto: RenameFolderDto): Promise<FileFolder> {
    return this.repo.manager.transaction(async (manager) => {
      const folder = await this.findOne(storeId, id);
      const previousName = folder.name;
      folder.name = dto.name;
      const saved = await manager.save(folder);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'folder.renamed',
        data: { from: previousName, to: saved.name },
      });

      return saved;
    });
  }

  async move(storeId: string, id: string, dto: MoveFolderDto): Promise<FileFolder> {
    return this.repo.manager.transaction(async (manager) => {
      const folder = await this.findOne(storeId, id);
      const targetParentId = dto.parentId ?? null;

      if (targetParentId) {
        // 404s if the target belongs to a different store, same as create().
        await this.findOne(storeId, targetParentId);

        // Whole-store load, not a per-ancestor round trip — a store's
        // folder tree is small enough (File Library, not a filesystem) that
        // this is simpler and cheaper than N sequential parent lookups.
        const allFolders = await manager.find(FileFolder, {
          where: { storeId },
          relations: { parent: true },
        });
        const parentById = new Map(allFolders.map((f) => [f.id, f.parent?.id ?? null]));

        if (wouldCreateCycle(id, targetParentId, (fid) => parentById.get(fid))) {
          throw new ConflictException('A folder cannot be moved into its own descendant.');
        }
      }

      const previousParentId = folder.parent?.id ?? null;
      folder.parent = targetParentId ? ({ id: targetParentId } as FileFolder) : null;
      const saved = await manager.save(folder);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'folder.moved',
        data: { from: previousParentId, to: targetParentId },
      });

      return saved;
    });
  }

  async remove(storeId: string, id: string): Promise<void> {
    return this.repo.manager.transaction(async (manager) => {
      const folder = await this.findOne(storeId, id);

      // Empty means no child folders *and* no files — file_asset now
      // exists, so this checks both. Uses the manager's own
      // createQueryBuilder against the entity class directly rather than
      // an injected FileAsset repository, so FoldersModule doesn't need to
      // import FilesModule (or vice versa) just for this one count.
      const childFolderCount = await manager
        .createQueryBuilder(FileFolder, this.alias)
        .where(`${this.alias}.store_id = :storeId`, { storeId })
        .andWhere(`${this.alias}.parent_id = :parentId`, { parentId: id })
        .getCount();
      const childFileCount = await manager
        .createQueryBuilder(FileAsset, 'file_asset')
        .where('file_asset.store_id = :storeId', { storeId })
        .andWhere('file_asset.folder_id = :folderId', { folderId: id })
        .getCount();
      if (childFolderCount > 0 || childFileCount > 0) {
        throw new ConflictException('Folder is not empty — move or delete its contents first.');
      }

      await manager.remove(folder);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: id,
        verb: 'folder.deleted',
        data: { name: folder.name },
      });
    });
  }
}
