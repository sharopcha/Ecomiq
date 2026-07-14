import { IsArray, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import type { CreateStorefrontReviewRequestDto } from '@temp-nx/api-types/crm';

/** No `customerId` field — implicit from the verified customer JWT, never client-supplied. */
export class CreateStorefrontReviewDto implements CreateStorefrontReviewRequestDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @IsString()
  @MinLength(1)
  orderId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaFileIds?: string[];
}
