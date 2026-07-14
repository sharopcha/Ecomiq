import { IsString, MinLength } from 'class-validator';

export class ReserveLicenseKeyDto {
  /** Plain reference — no order_line FK yet (see LicenseKey entity's doc comment). */
  @IsString()
  @MinLength(1)
  orderLineId!: string;
}
