import { IsDateString, IsEnum, IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { AdPlatform } from '../../entities/ad.entity';

export class CreateAdDto {
  @IsString()
  @MinLength(1)
  campaignId!: string;

  @IsEnum(AdPlatform)
  platform!: AdPlatform;

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
