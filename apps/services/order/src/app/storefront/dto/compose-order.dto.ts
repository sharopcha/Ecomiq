import { IsArray, IsEmail, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { ComposeOrderLineRequestDto, ComposeOrderRequestDto } from '@temp-nx/api-types/order';

export class ComposeOrderLineDto implements ComposeOrderLineRequestDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  qty!: number;

  @IsInt()
  expectedPriceMinor!: number; // Required for compose
}

export class ComposeOrderDto implements ComposeOrderRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComposeOrderLineDto)
  lines!: ComposeOrderLineDto[];

  @IsObject()
  @IsNotEmpty()
  shippingAddress!: Record<string, unknown>;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;
}

export type { ComposeOrderResponseDto } from '@temp-nx/api-types/order';
