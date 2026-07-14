import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';

/** At least one of the three scoping fields is required — same reasoning as FindStockMovementsQueryDto/FindStockAuditsQueryDto: this can't silently return a whole store's reservation history. */
export class FindReservationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  stockLevelId?: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;
}
