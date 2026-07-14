import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateOptionValueDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  value?: string;

  @IsOptional()
  @IsString()
  swatch?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
