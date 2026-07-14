import { IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

/**
 * `onHand` is deliberately absent — every cell starts at 0 and only ever
 * changes through a stock_movement. This endpoint just assigns a variant
 * to a location; if you're adding real quantity, that's an audit or a
 * purchase receipt (purchasing-service, later), not this.
 */
export class CreateStockLevelDto {
  @IsString()
  @MinLength(1)
  variantId!: string;

  @IsString()
  @MinLength(1)
  locationId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowThreshold?: number;

  /** Decimal amount (e.g. 12.50), converted to unitCostMinor — same convention as catalog's price/cost DTOs. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;
}
