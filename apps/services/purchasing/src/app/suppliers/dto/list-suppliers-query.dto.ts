import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { SupplierStatus } from '../../entities/supplier.entity';

export enum RatingSortDirection {
  Asc = 'asc',
  Desc = 'desc',
}

export class ListSuppliersQueryDto extends PaginationQueryDto {
  /** ILIKE match against name/email — inventory's stock-levels precedent, no trigram index. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(SupplierStatus)
  status?: SupplierStatus;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  favorite?: boolean;

  /**
   * When set, orders by `rating_avg` instead of the default `id ASC`. Cursor
   * pagination still keys off `id` as the tiebreaker, so a rating-sorted
   * page is only stable if no supplier's rating changes between page
   * fetches — acceptable for an admin table sort, not used for anything
   * that needs strict consistency.
   */
  @IsOptional()
  @IsEnum(RatingSortDirection)
  sortByRating?: RatingSortDirection;
}
