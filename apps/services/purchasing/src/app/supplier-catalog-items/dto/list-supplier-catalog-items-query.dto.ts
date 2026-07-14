import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';

export class ListSupplierCatalogItemsQueryDto extends PaginationQueryDto {
  /** ILIKE match against name/sku — same precedent as the supplier list's name/email search. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  inStock?: boolean;
}
