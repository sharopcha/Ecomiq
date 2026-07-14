import { IsOptional, IsString } from 'class-validator';

export class CheckoutOrderDto {
  @IsOptional()
  @IsString()
  discountCode?: string;
}
