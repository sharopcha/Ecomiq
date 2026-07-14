import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateSupplierCatalogItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceMinMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceMaxMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minOrderQty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  variantCount?: number;

  @IsOptional()
  @IsString()
  imageFileId?: string;

  @IsOptional()
  @IsString()
  linkedProductId?: string;

  @IsOptional()
  @IsString()
  variantId?: string;
}
