import { IsString, MinLength } from 'class-validator';

export class CreateProductTypeDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
