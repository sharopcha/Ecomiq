import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';

export enum FileSortBy {
  Name = 'name',
  Size = 'size',
  Updated = 'updated',
}

export enum SortDirection {
  Asc = 'asc',
  Desc = 'desc',
}

/**
 * A real class (not an inline intersection type) — see
 * `FindFoldersQueryDto`'s identical doc comment for why: Nest's
 * `ValidationPipe` reflects the parameter's design-time type, and an
 * intersection type erases to plain `Object`, silently disabling
 * validation/transformation for the whole query object.
 */
export class FindFilesQueryDto extends PaginationQueryDto {
  /** Omitted lists every file in the store, flat, regardless of folder. */
  @IsOptional()
  @IsString()
  folderId?: string;

  /** ILIKE match against name — suppliers' precedent, no trigram index. */
  @IsOptional()
  @IsString()
  search?: string;

  /** e.g. "image/" — matches `mimeType.startsWith(mimePrefix)`. */
  @IsOptional()
  @IsString()
  mimePrefix?: string;

  /** Omitted defaults to id-ascending (creation order), same as every other list endpoint. */
  @IsOptional()
  @IsEnum(FileSortBy)
  sortBy?: FileSortBy;

  @IsOptional()
  @IsEnum(SortDirection)
  sortDir?: SortDirection;
}
