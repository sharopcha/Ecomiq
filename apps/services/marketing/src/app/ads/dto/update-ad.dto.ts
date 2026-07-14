import { IsDateString, IsEnum, IsInt, IsObject, IsOptional, Min } from 'class-validator';
import { AdPlatform } from '../../entities/ad.entity';

export class UpdateAdDto {
  @IsOptional()
  @IsEnum(AdPlatform)
  platform?: AdPlatform;

  @IsOptional()
  @IsObject()
  audience?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  budgetMinor?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
