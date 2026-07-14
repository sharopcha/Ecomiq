import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsPositive } from 'class-validator';

export class TransformImageQueryDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  w!: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  h!: number;

  @IsOptional()
  @IsIn(['cover', 'contain'])
  fit?: 'cover' | 'contain';
}
