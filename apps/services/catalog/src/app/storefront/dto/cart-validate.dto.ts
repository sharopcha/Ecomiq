import { IsArray, IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { CartLineRequestDto } from '@temp-nx/api-types/catalog';

export class CartLineDto implements CartLineRequestDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  qty!: number;

  @IsOptional()
  @IsInt()
  expectedPriceMinor?: number;
}

export class CartValidateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  lines!: CartLineDto[];
}

export type {
  CartLineResponseDto,
  CartGroupResponseDto,
  CartValidateResponseDto,
} from '@temp-nx/api-types/catalog';
