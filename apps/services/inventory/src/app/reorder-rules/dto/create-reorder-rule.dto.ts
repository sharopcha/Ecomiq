import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { ReorderMethod } from '../../entities/reorder-rule.entity';

export class CreateReorderRuleDto {
  @IsString()
  @MinLength(1)
  variantId!: string;

  /** Omit to watch this variant across every warehouse — see ReorderRule's doc comment. */
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(ReorderMethod)
  method?: ReorderMethod;

  @IsInt()
  triggerLevel!: number;

  @IsInt()
  @Min(1)
  reorderQty!: number;

  /** Opaque purchasing-service reference, once that service exists — see ReorderRule.preferredSupplierId's doc comment. */
  @IsOptional()
  @IsString()
  preferredSupplierId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
