import { IsString, MinLength } from 'class-validator';

export class DelayShipmentDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
