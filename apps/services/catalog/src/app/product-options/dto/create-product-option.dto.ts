import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateOptionValueInputDto {
  @IsString()
  @MinLength(1)
  value!: string;

  @IsOptional()
  @IsString()
  swatch?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class CreateProductOptionDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsBoolean()
  useImages?: boolean;

  /** Optional initial values, e.g. creating "Color" with Midnight/Silver/Starlight in one call. Add more later via the values sub-endpoints. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOptionValueInputDto)
  values?: CreateOptionValueInputDto[];
}
