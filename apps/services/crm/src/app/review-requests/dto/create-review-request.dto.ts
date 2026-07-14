import { IsString, MinLength } from 'class-validator';

export class CreateReviewRequestDto {
  @IsString()
  @MinLength(1)
  orderId!: string;

  @IsString()
  @MinLength(1)
  customerId!: string;
}
