import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * Cursor-pagination query params — use as `@Query() query: PaginationQueryDto`
 * on any list endpoint. The cursor is a ULID id: because ULIDs sort
 * chronologically (see base.entity.ts), "rows after this id" is equivalent
 * to "rows created after this one," so no separate `created_at` cursor is
 * needed and the cursor is stable even if two rows share a timestamp.
 */
export class PaginationQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Applies `<alias>.id > :cursor order by <alias>.id asc limit :limit+1` and
 * slices the lookahead row back off to compute `nextCursor`. Call this last,
 * immediately before awaiting — it calls `getMany()` itself.
 */
export async function paginate<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  { cursor, limit }: PaginationQueryDto,
): Promise<PaginatedResult<T>> {
  if (cursor) {
    qb.andWhere(`${alias}.id > :cursor`, { cursor });
  }
  qb.orderBy(`${alias}.id`, 'ASC').take(limit + 1);

  const rows = await qb.getMany();
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? ((items[items.length - 1] as unknown as { id: string }).id ?? null)
    : null;

  return { items, nextCursor };
}
