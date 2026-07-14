import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { RefundType } from '../../entities/refund.entity';

export class CreateRefundDto {
  /** Optional — an approved RMA this refund settles. Omit for a direct/goodwill refund with no RMA behind it. */
  @IsOptional()
  @IsString()
  returnId?: string;

  @IsEnum(RefundType)
  refundType!: RefundType;

  /** Required unless `refundType: 'none'` (forced to 0 regardless of what's sent here — data-model rule 4). */
  @IsOptional()
  @IsInt()
  @Min(0)
  amountMinor?: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  messageToCustomer?: string;

  @IsOptional()
  @IsBoolean()
  sendInfoToCustomer?: boolean;
}
