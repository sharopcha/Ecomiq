import { IsISO8601, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';

/**
 * "Stock History" row action. `stockLevelId` scopes to one warehouse cell;
 * `variantId` scopes across every warehouse the variant has a cell in.
 * The service requires at least one of the two (see StockMovementsService.list).
 *
 * `createdFrom`/`createdTo` are optional inclusive bounds on `created_at`
 * (ISO 8601), combinable with the scoping params and cursor pagination — the
 * Inventory list screenshot's "2 Feb - 14 Apr" date-range control has no
 * equivalent on the (not time-scoped) stock-levels list, so it lives here
 * instead, on the ledger that actually is time-scoped.
 */
export class FindStockMovementsQueryDto extends PaginationQueryDto {
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
