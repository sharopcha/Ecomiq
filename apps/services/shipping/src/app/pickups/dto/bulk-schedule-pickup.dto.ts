import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PickupInputDto {
  /** Opaque `shipment.id` — same-DB (shipping_db), a real FK. */
  @IsString()
  @MinLength(1)
  shipmentId!: string;

  @IsString()
  @MinLength(1)
  carrier!: string;

  @IsDateString()
  pickupDate!: string;

  @IsOptional()
  @IsString()
  pickupTime?: string;

  @IsOptional()
  @IsString()
  meridiem?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class BulkSchedulePickupDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PickupInputDto)
  pickups!: PickupInputDto[];
}
