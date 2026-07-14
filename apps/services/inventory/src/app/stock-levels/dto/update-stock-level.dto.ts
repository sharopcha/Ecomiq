import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Same onHand exclusion as CreateStockLevelDto — see its doc comment.
 * `lowThreshold`/`unitCost` accept `null` to explicitly clear them (same
 * `@IsOptional()`-skips-`null`-too convention as catalog's UpdateCategoryDto.parentId).
 */
export class UpdateStockLevelDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  lowThreshold?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number | null;
}
