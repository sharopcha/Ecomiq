import { IsDateString, IsEmail, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateShipmentDto {
  /** Opaque `order.id` — order lives in order_db (ADR-2), no cross-DB FK. */
  @IsString()
  @MinLength(1)
  orderId!: string;

  @IsOptional()
  @IsString()
  fulfillmentId?: string;

  @IsOptional()
  @IsString()
  carrier?: string;

  @IsOptional()
  @IsString()
  serviceType?: string;

  @IsOptional()
  @IsDateString()
  shipDate?: string;

  @IsOptional()
  @IsObject()
  originAddress?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  destinationAddress?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  expectedArrivalAt?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}
