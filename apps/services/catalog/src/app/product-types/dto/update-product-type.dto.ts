import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProductTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
