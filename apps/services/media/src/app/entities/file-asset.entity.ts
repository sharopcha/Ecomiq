import { Column, Entity, JoinColumn, ManyToOne, ValueTransformer } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';
import { FileFolder } from './file-folder.entity';

export enum FileSource {
  Upload = 'upload',
  ContentLibrary = 'content_library',
  Unsplash = 'unsplash',
  AiGenerated = 'ai_generated',
  Dropbox = 'dropbox',
  GoogleDrive = 'google_drive',
  OneDrive = 'one_drive',
}

/**
 * `bigint` columns come back from node-postgres as a *string* (precision
 * safety — same reasoning as money.ts's `MoneyTransformer`, which this
 * mirrors exactly). Byte sizes stay well within JS's safe integer range for
 * any realistic file (`MEDIA_MAX_SIZE_BYTES` is nowhere near 2^53), so a
 * plain `number` on the application side is fine.
 */
const ByteSizeTransformer: ValueTransformer = {
  to: (value?: number | null): string | null =>
    value === undefined || value === null ? null : String(Math.trunc(value)),
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};

/**
 * `owner_id` (and every other cross-service id in this repo, e.g.
 * `ActivityLog.actorId`) is a plain unconstrained text column, not a real
 * FK — `app_user` lives in identity-service's own database (ADR-2,
 * database-per-service), so a literal Postgres FK across databases isn't
 * possible. The data model doc's `REFERENCES app_user(id)` is the
 * conceptual relationship, enforced by the JWT issuer, not by Postgres.
 */
@Entity('file_asset')
export class FileAsset extends TenantScopedEntity {
  @ManyToOne(() => FileFolder, { nullable: true })
  @JoinColumn({ name: 'folder_id' })
  folder?: FileFolder | null;

  @Column({ type: 'text', name: 'owner_id', nullable: true })
  ownerId?: string | null;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', name: 'mime_type' })
  mimeType!: string;

  @Column({ type: 'bigint', name: 'size_bytes', transformer: ByteSizeTransformer })
  sizeBytes!: number;

  @Column({ type: 'text', name: 'storage_key' })
  storageKey!: string;

  @Column({ type: 'enum', enum: FileSource, enumName: 'file_source', default: FileSource.Upload })
  source!: FileSource;

  @Column({ type: 'text', name: 'external_ref', nullable: true })
  externalRef?: string | null;

  @Column({ type: 'int', name: 'duration_seconds', nullable: true })
  durationSeconds?: number | null;
}
