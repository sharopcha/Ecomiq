import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { ReferralStatus } from '../../entities/referral.entity';

export class ListReferralsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ReferralStatus)
  status?: ReferralStatus;

  @IsOptional()
  @IsString()
  referrerId?: string;

  @IsOptional()
  @IsString()
  refereeId?: string;
}
