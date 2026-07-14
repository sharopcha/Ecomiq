import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateShippingLabelPackageDto {
  @IsOptional()
  @IsString()
  orderLineId?: string;

  @IsOptional()
  @IsString()
  packagePresetId?: string;

  @IsOptional()
  @IsString()
  packageName?: string;

  @IsOptional()
  @IsString()
  packageType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  itemWeightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalWeightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lengthCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  widthCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heightCm?: number;

  /** "Combine Package" — this row groups more than one order line into one physical package. */
  @IsOptional()
  @IsBoolean()
  combined?: boolean;
}

export class CreateShippingLabelDto {
  /** Opaque `order.id` — order lives in order_db (ADR-2), no cross-DB FK. */
  @IsString()
  @MinLength(1)
  orderId!: string;

  @IsString()
  @MinLength(1)
  carrier!: string;

  @IsOptional()
  @IsString()
  serviceType?: string;

  @IsOptional()
  @IsString()
  insurance?: string;

  @IsOptional()
  @IsDateString()
  shipDate?: string;

  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean;

  @IsOptional()
  @IsObject()
  returnAddress?: Record<string, unknown>;

  /** Drives `CarrierProviderPort.getRates()`'s destination and, once persisted, `purchaseLabel()`'s deterministic-failure check (postal code ending `99`). */
  @IsOptional()
  @IsObject()
  destinationAddress?: Record<string, unknown>;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateShippingLabelPackageDto)
  packages!: CreateShippingLabelPackageDto[];
}
