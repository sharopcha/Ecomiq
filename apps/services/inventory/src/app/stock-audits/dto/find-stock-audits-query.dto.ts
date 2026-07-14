import { IsISO8601, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';

/**
 * The Audit Stock modal's "Stock adjustment history" right rail. Same
 * scoping shape as FindStockMovementsQueryDto — `stockLevelId` for one
 * warehouse cell, `variantId` for every warehouse the variant has a cell in
 * — the service requires at least one of the two.
 *
 * `createdFrom`/`createdTo` — same optional inclusive `created_at` bounds
 * (ISO 8601) as FindStockMovementsQueryDto, for the same reason.
 */
export class FindStockAuditsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  stockLevelId?: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @IsOptional()
  @IsISO8601()
  createdTo?: string;
}
