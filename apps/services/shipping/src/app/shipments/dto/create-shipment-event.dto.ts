import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ShipmentEventKind } from '../../entities/shipment-event.entity';

export class CreateShipmentEventDto {
  @IsEnum(ShipmentEventKind)
  kind!: ShipmentEventKind;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  /** Defaults to now() if omitted — set explicitly when logging something that already happened (e.g. a carrier's own report). */
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
