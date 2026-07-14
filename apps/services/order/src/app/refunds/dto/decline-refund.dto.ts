import { IsOptional, IsString } from 'class-validator';

export class DeclineRefundDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
