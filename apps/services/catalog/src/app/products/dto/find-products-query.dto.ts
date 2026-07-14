import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { ProductKind, ProductStatus } from '../../entities/product.entity';

/** Real class, not an inline intersection type — see FindCategoriesQueryDto for why that matters. */
export class FindProductsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;
}
