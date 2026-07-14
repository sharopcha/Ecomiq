import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { DiscountKind } from '../../entities/discount.entity';

export class CreateDiscountDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsEnum(DiscountKind)
  kind!: DiscountKind;

  /** Basis points | amountMinor | unused, per `kind` — see Discount.value's doc comment. */
  @IsInt()
  @Min(0)
  value!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @IsOptional()
  @IsBoolean()
  oncePerCustomer?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minSubtotalMinor?: number;
}
