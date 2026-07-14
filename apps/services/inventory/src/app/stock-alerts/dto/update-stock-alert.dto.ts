import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { AlertAction, AlertOperator } from '../../entities/stock-alert.entity';

/** variantId isn't updatable — an alert scoped to the wrong variant should be deleted and recreated, not repointed. locationId can be cleared to null to switch to "watch every warehouse." */
export class UpdateStockAlertDto {
  /** `@IsOptional()` skips validation for both `undefined` (omitted) and `null` (explicit clear) — `@IsString()` still applies if a real value is sent. */
  @IsOptional()
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @IsInt()
  threshold?: number;

  @IsOptional()
  @IsEnum(AlertOperator)
  direction?: AlertOperator;

  @IsOptional()
  @IsArray()
  @IsEnum(AlertAction, { each: true })
  actions?: AlertAction[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
