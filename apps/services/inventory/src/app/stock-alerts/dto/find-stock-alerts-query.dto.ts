import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';

export class FindStockAlertsQueryDto extends PaginationQueryDto {
  /** Filter to alerts on one variant — e.g. to check whether the Inventory list row already has one before showing "Create Stock Alert" vs "Edit Stock Alert". */
  @IsOptional()
  @IsString()
  variantId?: string;
}
