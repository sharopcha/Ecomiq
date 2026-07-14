import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class BundleItemInputDto {
  @IsString()
  @MinLength(1)
  variantId!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

export class CreateBundleDto {
  @IsString()
  @MinLength(1)
  name!: string;

  /** Decimal amount in, e.g. 99.00 — converted to price_minor in the service via toMinorUnits, same as Product. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BundleItemInputDto)
  items!: BundleItemInputDto[];
}
