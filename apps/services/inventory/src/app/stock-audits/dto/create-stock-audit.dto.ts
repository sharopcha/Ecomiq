import { IsEnum, IsInt, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { StockAdjustReason, StockAdjustType } from '../../entities/stock-audit.entity';

/**
 * The Audit Stock modal. Which of `physicalCount`/`valueDelta` is required
 * depends on `adjustType` — enforced in StockAuditsService.create rather
 * than with class-validator's `@ValidateIf` here, since the resulting error
 * needs to reference `availableBefore` (only known once the stock_level is
 * loaded), not just the raw DTO shape.
 */
export class CreateStockAuditDto {
  @IsString()
  @MinLength(1)
  stockLevelId!: string;

  @IsEnum(StockAdjustType)
  adjustType!: StockAdjustType;

  /** Required when adjustType='quantity' — the counted quantity ("Physical Count 15"). */
  @IsOptional()
  @IsInt()
  physicalCount?: number;

  /** Required when adjustType='value' — decimal amount (e.g. 250.00), converted to valueDeltaMinor. No quantity/stock_movement change results from this mode. */
  @IsOptional()
  @IsNumber()
  valueDelta?: number;

  @IsEnum(StockAdjustReason)
  reason!: StockAdjustReason;

  @IsOptional()
  @IsString()
  note?: string;
}
