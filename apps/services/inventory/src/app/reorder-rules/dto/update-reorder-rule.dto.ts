import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ReorderMethod } from '../../entities/reorder-rule.entity';

/** variantId isn't updatable — a rule scoped to the wrong variant should be deleted and recreated, not repointed (same policy as UpdateStockAlertDto). locationId/preferredSupplierId can be cleared to null. */
export class UpdateReorderRuleDto {
  @IsOptional()
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @IsEnum(ReorderMethod)
  method?: ReorderMethod;

  @IsOptional()
  @IsInt()
  triggerLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  reorderQty?: number;

  @IsOptional()
  @IsString()
  preferredSupplierId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
