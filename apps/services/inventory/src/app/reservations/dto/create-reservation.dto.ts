import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateReservationDto {
  @IsString()
  @MinLength(1)
  stockLevelId!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  /** Opaque order-service reference, once that service exists — see Reservation.orderId's doc comment. */
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  orderLineId?: string;
}
