import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class PurchaseOrderLineDto {
  @IsOptional()
  @IsString()
  supplierCatalogItemId?: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsInt()
  @Min(0)
  unitCostMinor!: number;
}
