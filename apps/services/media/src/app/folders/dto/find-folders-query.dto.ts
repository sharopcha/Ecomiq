import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';

/**
 * A real class (not an inline intersection type) is required here — Nest's
 * ValidationPipe picks its validator off the parameter's *reflected*
 * design-time type, and an intersection type like
 * `PaginationQueryDto & { parentId?: string }` gets erased to plain `Object`
 * at compile time, which silently disables validation/transformation
 * (including the `limit` -> Number coercion) for the whole query object.
 */
export class FindFoldersQueryDto extends PaginationQueryDto {
  /** Omitted lists every folder in the store (flat); set to browse one level of the tree. */
  @IsOptional()
  @IsString()
  parentId?: string;
}
