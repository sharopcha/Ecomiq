import { IsEnum } from 'class-validator';
import { ShipmentStatus } from '../../entities/shipment.entity';

export class TransitionShipmentDto {
  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;
}
