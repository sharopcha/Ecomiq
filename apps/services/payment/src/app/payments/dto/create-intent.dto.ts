import { IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateIntentDto {
  @IsString()
  @MinLength(1)
  orderId!: string;

  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}
