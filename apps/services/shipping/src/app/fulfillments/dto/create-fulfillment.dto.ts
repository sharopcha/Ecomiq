import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class FulfillmentLineInputDto {
  /** Opaque `order_line.id` — order_line lives in order_db (ADR-2), no cross-DB FK. */
  @IsString()
  @MinLength(1)
  orderLineId!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightLb?: number;
}

export class CreateFulfillmentDto {
  /** Opaque `order.id` — order lives in order_db (ADR-2), no cross-DB FK. */
  @IsString()
  @MinLength(1)
  orderId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FulfillmentLineInputDto)
  lines!: FulfillmentLineInputDto[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  trackingNumbers!: string[];

  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean;
}
