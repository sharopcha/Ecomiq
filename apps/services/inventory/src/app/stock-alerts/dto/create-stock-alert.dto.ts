import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { AlertAction, AlertOperator } from '../../entities/stock-alert.entity';

export class CreateStockAlertDto {
  @IsString()
  @MinLength(1)
  variantId!: string;

  /** Omit to watch this variant across every warehouse — see StockAlert's doc comment. */
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsInt()
  threshold!: number;

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
