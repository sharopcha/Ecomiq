import { IsString, MinLength } from 'class-validator';

export class FindPaymentsQueryDto {
  @IsString()
  @MinLength(1)
  orderId!: string;
}
