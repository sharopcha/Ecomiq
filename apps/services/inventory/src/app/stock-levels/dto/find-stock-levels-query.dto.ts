import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { StockStatus } from '../stock-status.util';

/**
 * Real class, not an inline intersection type — see catalog's
 * FindCategoriesQueryDto for why that matters (ValidationPipe needs the
 * reflected design-time type to be this class, not an erased `Object`).
 */
export class FindStockLevelsQueryDto extends PaginationQueryDto {
  /** Scope to one warehouse's stock_level rows. Omitted = aggregate on_hand/reserved across every location (matches the product detail screen's top-level "On hand stock" number, which sums all warehouses). */
  @IsOptional()
  @IsString()
  locationId?: string;

  /** Filters on the catalog product snapshot's categoryId (Inventory list's "Category" dropdown). */
  @IsOptional()
  @IsString()
  categoryId?: string;

  /** Inventory list's "Stock level" dropdown — matches computeStockStatus's buckets. */
  @IsOptional()
  @IsIn(['out', 'low', 'high'])
  stockLevel?: StockStatus;

  /** Matches against product name or variant SKU (Inventory list's search box). */
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Scope to a single variant — a precise alternative to `?locationId=&search=<sku>`
   * for resolving one variant's row(s) (e.g. before an Audit Stock/Reserve Item
   * action on an aggregated row where `id` is null). Combinable with `locationId`
   * to pin down one variant at one warehouse.
   */
  @IsOptional()
  @IsString()
  variantId?: string;
}
