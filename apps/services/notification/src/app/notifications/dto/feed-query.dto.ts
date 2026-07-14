import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Plain offset pagination, deliberately not this repo's usual ULID cursor
 * (`PaginationQueryDto`) — the feed's "unread first" ordering reshuffles
 * rows in a way that isn't compatible with a monotonic id cursor, and a
 * single store's staff bell feed doesn't need keyset pagination's
 * guarantees at this scale.
 */
export class FeedQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
