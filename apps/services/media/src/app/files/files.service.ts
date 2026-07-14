import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import sharp from 'sharp';
import { PaginatedResult, assertOwnedByStore } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { FileAsset, FileSource } from '../entities/file-asset.entity';
import { FoldersService } from '../folders/folders.service';
import { StorageService } from '../storage/storage.service';
import { buildDerivedKey, buildDerivedPrefix, buildOriginalKey } from '../storage/key-layout';
import { writeActivityLog } from '../common/activity-log.util';
import { FileEventType, MEDIA_FILE_AGGREGATE_TYPE } from '../events/media-event-types';
import {
  EXTERNAL_SOURCE_REGISTRY,
  ExternalSourceRegistry,
} from '../external-sources/external-source-registry.token';
import { isMimeAllowed, isSizeAllowed, parseAllowedMimePrefixes } from './upload-validation';
import { clampDimension, TransformFit } from './image-transform';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { FindFilesQueryDto, FileSortBy, SortDirection } from './dto/find-files-query.dto';
import { RenameFileDto } from './dto/rename-file.dto';
import { MoveFileDto } from './dto/move-file.dto';
import { TransformImageQueryDto } from './dto/transform-image-query.dto';
import { ImportFileDto } from './dto/import-file.dto';

const NO_ADAPTER_SOURCES = new Set<FileSource>([FileSource.ContentLibrary, FileSource.AiGenerated]);

const SUBJECT_TABLE = 'file';
const ALIAS = 'file_asset';
const DEFAULT_MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200MB — generous since uploads bypass the gateway's PROXY_BODY_LIMIT entirely (presign-direct-to-MinIO)
const DEFAULT_ALLOWED_MIME_PREFIXES = 'image/,video/,application/pdf';
const DEFAULT_MAX_TRANSFORM_DIMENSION = 2000;

const SORT_COLUMN: Record<FileSortBy, string> = {
  [FileSortBy.Name]: 'name',
  [FileSortBy.Size]: 'size_bytes',
  [FileSortBy.Updated]: 'updated_at',
};

export interface FileWithDownloadUrl extends FileAsset {
  downloadUrl: string;
}

export interface PresignUploadResult {
  fileId: string;
  uploadUrl: string;
}

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileAsset) private readonly repo: Repository<FileAsset>,
    private readonly folders: FoldersService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    @Inject(EXTERNAL_SOURCE_REGISTRY) private readonly externalSources: ExternalSourceRegistry,
  ) {}

  private allowedMimePrefixes(): string[] {
    return parseAllowedMimePrefixes(
      this.config.get<string>('MEDIA_ALLOWED_MIME_PREFIXES', DEFAULT_ALLOWED_MIME_PREFIXES),
    );
  }

  private maxSizeBytes(): number {
    return this.config.get<number>('MEDIA_MAX_SIZE_BYTES', DEFAULT_MAX_SIZE_BYTES);
  }

  private assertUploadAllowed(mimeType: string, declaredSizeBytes: number): void {
    if (!isMimeAllowed(mimeType, this.allowedMimePrefixes())) {
      throw new BadRequestException(`mimeType "${mimeType}" is not allowed.`);
    }
    if (!isSizeAllowed(declaredSizeBytes, this.maxSizeBytes())) {
      throw new BadRequestException(
        `declaredSizeBytes must be between 1 and ${this.maxSizeBytes()} bytes.`,
      );
    }
  }

  private toEventPayload(file: FileAsset): Record<string, unknown> {
    return {
      id: file.id,
      storeId: file.storeId,
      folderId: file.folder?.id ?? null,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      source: file.source,
    };
  }

  /**
   * No row is created here — only a presigned PUT URL against a
   * not-yet-existing key. `fileId` is generated up front (not derived from
   * anything server-side-persisted) so the client can compute the exact
   * same key again in `complete()` just by re-sending `name`.
   */
  async presign(storeId: string, dto: PresignUploadDto): Promise<PresignUploadResult> {
    this.assertUploadAllowed(dto.mimeType, dto.declaredSizeBytes);

    if (dto.folderId) {
      await this.folders.findOne(storeId, dto.folderId);
    }

    const fileId = ulid();
    const storageKey = buildOriginalKey(storeId, fileId, dto.name);
    const uploadUrl = await this.storage.putPresign(storageKey, dto.mimeType);

    return { fileId, uploadUrl };
  }

  /**
   * HEADs the real object before trusting anything the client claims —
   * `declaredSizeBytes`/`mimeType` here are what the client *says* it
   * uploaded, cross-checked against what MinIO actually received. A
   * mismatch deletes the stray object rather than leaving it orphaned in
   * the bucket with no `file_asset` row ever pointing at it.
   */
  async complete(
    storeId: string,
    fileId: string,
    ownerId: string | null,
    dto: CompleteUploadDto,
  ): Promise<FileAsset> {
    this.assertUploadAllowed(dto.mimeType, dto.declaredSizeBytes);

    if (dto.folderId) {
      await this.folders.findOne(storeId, dto.folderId);
    }

    const storageKey = buildOriginalKey(storeId, fileId, dto.name);
    const head = await this.storage.head(storageKey);
    if (!head) {
      throw new BadRequestException(
        'Uploaded object not found — the presigned PUT may not have completed.',
      );
    }
    if (head.sizeBytes !== dto.declaredSizeBytes) {
      await this.storage.delete(storageKey);
      throw new BadRequestException(
        `Size mismatch: declared ${dto.declaredSizeBytes} bytes, object is ${head.sizeBytes} bytes.`,
      );
    }
    if (head.contentType !== dto.mimeType) {
      await this.storage.delete(storageKey);
      throw new BadRequestException(
        `Content-type mismatch: declared "${dto.mimeType}", object is "${head.contentType}".`,
      );
    }

    return this.repo.manager.transaction(async (manager) => {
      // `id: fileId`, not autogenerated — the id was already handed to the
      // client at presign() time (it's baked into `storageKey` via
      // buildOriginalKey), so the row has to reuse it rather than
      // BaseEntity's @BeforeInsert generating a fresh one. Getting this
      // wrong silently breaks every future GET /files/:id lookup by the id
      // the client actually has — caught by upload-demo.ts asserting
      // `asset.id === fileId`, not by TypeScript.
      const file = manager.create(FileAsset, {
        id: fileId,
        storeId,
        folder: dto.folderId ? ({ id: dto.folderId } as never) : null,
        ownerId,
        name: dto.name,
        mimeType: dto.mimeType,
        sizeBytes: head.sizeBytes,
        storageKey,
        source: FileSource.Upload,
      });
      const saved = await manager.save(file);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'file.created',
        actorId: ownerId,
        data: { name: saved.name, sizeBytes: saved.sizeBytes, mimeType: saved.mimeType },
      });

      await recordOutboxEvent(manager, {
        eventType: FileEventType.FileCreated,
        storeId,
        aggregateType: MEDIA_FILE_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  private async findOwned(storeId: string, id: string): Promise<FileAsset> {
    const file = await this.repo.findOne({ where: { id }, relations: { folder: true } });
    return assertOwnedByStore(file, storeId, () => new NotFoundException(`file ${id} not found`));
  }

  /**
   * Hand-rolled cursor pagination (not the generic `paginate()` helper) —
   * same reasoning as purchasing's `SuppliersService.findAll`: a custom
   * sort column needs its own `ORDER BY`, with `id` kept as the tiebreaker
   * so the cursor stays well-defined.
   */
  async findAll(storeId: string, query: FindFilesQueryDto): Promise<PaginatedResult<FileAsset>> {
    const qb = this.repo.createQueryBuilder(ALIAS).where(`${ALIAS}.store_id = :storeId`, { storeId });

    if (query.folderId) {
      qb.andWhere(`${ALIAS}.folder_id = :folderId`, { folderId: query.folderId });
    }
    if (query.search) {
      qb.andWhere(`${ALIAS}.name ILIKE :search`, { search: `%${query.search}%` });
    }
    if (query.mimePrefix) {
      qb.andWhere(`${ALIAS}.mime_type LIKE :mimePrefix`, { mimePrefix: `${query.mimePrefix}%` });
    }
    if (query.cursor) {
      qb.andWhere(`${ALIAS}.id > :cursor`, { cursor: query.cursor });
    }

    const direction = query.sortDir === SortDirection.Desc ? 'DESC' : 'ASC';
    if (query.sortBy) {
      qb.orderBy(`${ALIAS}.${SORT_COLUMN[query.sortBy]}`, direction);
      qb.addOrderBy(`${ALIAS}.id`, 'ASC');
    } else {
      qb.orderBy(`${ALIAS}.id`, 'ASC');
    }
    qb.take(query.limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  /** Metadata + a short-lived presigned GET — admin/library reads, never a redirect (that's the public route, Step 8). */
  async findOneWithDownloadUrl(storeId: string, id: string): Promise<FileWithDownloadUrl> {
    const file = await this.findOwned(storeId, id);
    const downloadUrl = await this.storage.getPresign(file.storageKey);
    return Object.assign(file, { downloadUrl });
  }

  async rename(storeId: string, id: string, dto: RenameFileDto): Promise<FileAsset> {
    return this.repo.manager.transaction(async (manager) => {
      const file = await this.findOwned(storeId, id);
      const previousName = file.name;
      file.name = dto.name;
      const saved = await manager.save(file);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'file.renamed',
        data: { from: previousName, to: saved.name },
      });
      await recordOutboxEvent(manager, {
        eventType: FileEventType.FileUpdated,
        storeId,
        aggregateType: MEDIA_FILE_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  async moveToFolder(storeId: string, id: string, dto: MoveFileDto): Promise<FileAsset> {
    return this.repo.manager.transaction(async (manager) => {
      const file = await this.findOwned(storeId, id);
      const targetFolderId = dto.folderId ?? null;

      if (targetFolderId) {
        await this.folders.findOne(storeId, targetFolderId);
      }

      const previousFolderId = file.folder?.id ?? null;
      file.folder = targetFolderId ? ({ id: targetFolderId } as never) : null;
      const saved = await manager.save(file);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'file.moved',
        data: { from: previousFolderId, to: targetFolderId },
      });
      await recordOutboxEvent(manager, {
        eventType: FileEventType.FileUpdated,
        storeId,
        aggregateType: MEDIA_FILE_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  /**
   * S3 object + its whole `derived/<id>/` prefix + the row, in that order —
   * if the S3 side throws, the DB transaction never starts, leaving row and
   * object both still present (retryable) rather than a row with no object
   * behind it. If the DB transaction fails after S3 succeeds, the row is
   * gone from the store's view; the S3 deletes already happened so there's
   * nothing left to orphan.
   */
  async remove(storeId: string, id: string): Promise<void> {
    const file = await this.findOwned(storeId, id);

    await this.storage.delete(file.storageKey);
    await this.storage.deleteByPrefix(buildDerivedPrefix(file.id));

    await this.repo.manager.transaction(async (manager) => {
      await manager.remove(file);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: id,
        verb: 'file.deleted',
        data: { name: file.name },
      });
      await recordOutboxEvent(manager, {
        eventType: FileEventType.FileDeleted,
        storeId,
        aggregateType: MEDIA_FILE_AGGREGATE_TYPE,
        aggregateId: id,
        payload: { id, storeId },
      });
    });
  }

  /** Sequential, fail-fast — same convention as shipping's PickupsService.scheduleBulk. */
  async removeMany(storeId: string, ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.remove(storeId, id);
    }
  }

  /**
   * Returns a presigned GET URL for the requested derivative, generating
   * it on first request and reusing it on every one after — the caller
   * 302-redirects here rather than streaming bytes itself. Shared by both
   * the authenticated (`getImageRedirectUrl`) and public
   * (`getPublicImageRedirectUrl`) routes — the only difference between them
   * is how `file` was looked up (store-owned vs. id-only), never what
   * happens to it once found.
   */
  private async buildImageRedirectUrl(file: FileAsset, query: TransformImageQueryDto): Promise<string> {
    if (!file.mimeType.startsWith('image/')) {
      throw new UnsupportedMediaTypeException(
        `file ${file.id} is not an image (${file.mimeType}) and cannot be transformed`,
      );
    }

    const maxDimension = this.config.get<number>(
      'MEDIA_MAX_TRANSFORM_DIMENSION',
      DEFAULT_MAX_TRANSFORM_DIMENSION,
    );
    const width = clampDimension(query.w, maxDimension);
    const height = clampDimension(query.h, maxDimension);
    const fit: TransformFit = query.fit ?? 'cover';

    const derivedKey = buildDerivedKey(file.id, width, height, fit, 'webp');

    const existing = await this.storage.head(derivedKey);
    if (!existing) {
      const original = await this.storage.getObjectBytes(file.storageKey);
      const resized = await sharp(original).resize(width, height, { fit }).webp().toBuffer();
      await this.storage.putObject(derivedKey, resized, 'image/webp');
    }

    return this.storage.getPresign(derivedKey);
  }

  async getImageRedirectUrl(
    storeId: string,
    id: string,
    query: TransformImageQueryDto,
  ): Promise<string> {
    const file = await this.findOwned(storeId, id);
    return this.buildImageRedirectUrl(file, query);
  }

  /**
   * id-addressed, no store scoping — the file's `storeId` is resolved from
   * the row itself, not from a caller-supplied store context, because
   * there is none: this is what `@Public()` routes serve. Unguessable ULID
   * ids are the access token (ECOMIQ-DATA-MODEL.md's "nothing sensitive"
   * note) — there is deliberately no listing/search here, id-or-nothing.
   */
  async findPublicAsset(id: string): Promise<FileAsset> {
    const file = await this.repo.findOne({ where: { id } });
    if (!file) {
      throw new NotFoundException(`file ${id} not found`);
    }
    return file;
  }

  async getPublicDownloadUrl(id: string): Promise<string> {
    const file = await this.findPublicAsset(id);
    return this.storage.getPresign(file.storageKey);
  }

  async getPublicImageRedirectUrl(id: string, query: TransformImageQueryDto): Promise<string> {
    const file = await this.findPublicAsset(id);
    return this.buildImageRedirectUrl(file, query);
  }

  /**
   * Adapter-backed sources (unsplash/dropbox/google_drive/one_drive)
   * resolve bytes via `ExternalSourcePort.fetch`; `content_library`/
   * `ai_generated` have no adapter (`NO_ADAPTER_SOURCES`) — the caller
   * supplies `url` directly and this fetches it itself, the plan's
   * "ai-service's future path" placeholder. Either way the result lands
   * through the same storage + row-creation path `complete()` uses, just
   * via a direct server-side `putObject` instead of a presigned PUT (the
   * bytes already exist server-side by the time this runs; there's no
   * client upload step to arrange for).
   */
  async importFile(storeId: string, ownerId: string | null, dto: ImportFileDto): Promise<FileAsset> {
    if (dto.folderId) {
      await this.folders.findOne(storeId, dto.folderId);
    }

    let bytes: Buffer;
    let mimeType: string;
    let name: string;
    let externalRef: string | null = null;

    if (NO_ADAPTER_SOURCES.has(dto.source)) {
      if (!dto.url) {
        throw new BadRequestException(`url is required to import a "${dto.source}" file`);
      }
      if (!dto.name) {
        throw new BadRequestException(`name is required to import a "${dto.source}" file`);
      }
      const response = await fetch(dto.url);
      if (!response.ok) {
        throw new BadRequestException(`failed to fetch ${dto.url}: ${response.status}`);
      }
      bytes = Buffer.from(await response.arrayBuffer());
      mimeType = response.headers.get('content-type') ?? 'application/octet-stream';
      name = dto.name;
    } else {
      const adapter = this.externalSources.get(dto.source);
      if (!adapter) {
        throw new BadRequestException(`no import adapter registered for source "${dto.source}"`);
      }
      if (!dto.externalRef) {
        throw new BadRequestException(`externalRef is required to import from "${dto.source}"`);
      }
      const fetched = await adapter.fetch(dto.externalRef);
      bytes = fetched.bytes;
      mimeType = fetched.mimeType;
      name = dto.name ?? fetched.name;
      externalRef = dto.externalRef;
    }

    this.assertUploadAllowed(mimeType, bytes.length);

    const fileId = ulid();
    const storageKey = buildOriginalKey(storeId, fileId, name);
    await this.storage.putObject(storageKey, bytes, mimeType);

    return this.repo.manager.transaction(async (manager) => {
      const file = manager.create(FileAsset, {
        id: fileId,
        storeId,
        folder: dto.folderId ? ({ id: dto.folderId } as never) : null,
        ownerId,
        name,
        mimeType,
        sizeBytes: bytes.length,
        storageKey,
        source: dto.source,
        externalRef,
      });
      const saved = await manager.save(file);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'file.imported',
        actorId: ownerId,
        data: { name: saved.name, source: saved.source, externalRef },
      });

      await recordOutboxEvent(manager, {
        eventType: FileEventType.FileImported,
        storeId,
        aggregateType: MEDIA_FILE_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }
}
