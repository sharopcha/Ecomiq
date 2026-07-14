import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { FileSource } from '../../entities/file-asset.entity';

export class ImportFileDto {
  @IsEnum(FileSource)
  source!: FileSource;

  /** Required for adapter-backed sources (unsplash/dropbox/google_drive/one_drive); ignored otherwise. */
  @IsOptional()
  @IsString()
  externalRef?: string;

  /** Required for content_library/ai_generated (no adapter — the caller fetches its own bytes from here); ignored otherwise. */
  @IsOptional()
  @IsString()
  url?: string;

  /** Required for content_library/ai_generated; derived from the adapter's own result for adapter-backed sources unless overridden. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  folderId?: string;
}
