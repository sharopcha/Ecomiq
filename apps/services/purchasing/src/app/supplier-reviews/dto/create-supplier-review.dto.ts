import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateSupplierReviewDto {
  @IsOptional()
  @IsString()
  authorName?: string;

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
}
