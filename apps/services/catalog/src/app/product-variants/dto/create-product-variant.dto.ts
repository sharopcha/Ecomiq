import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateProductVariantDto {
  /** Auto-generated from the product's base SKU + a running suffix when omitted. */
  @IsOptional()
  @IsString()
  sku?: string;

  /** Decimal amount (e.g. 24.99) — omit to inherit the product's own price. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** First variant ever created for a product becomes the default automatically if this is omitted. */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  imageFileId?: string;

  /** Exactly one value per one of the product's options — [] only valid when the product has no options defined. */
  @IsArray()
  @ArrayMinSize(0)
  @IsString({ each: true })
  optionValueIds!: string[];
}
