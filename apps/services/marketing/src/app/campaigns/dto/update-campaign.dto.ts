import { IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { CampaignKind } from '../../entities/campaign.entity';

export class UpdateCampaignDto {
  @IsOptional()
  @IsEnum(CampaignKind)
  kind?: CampaignKind;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsObject()
  audience?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  contentRef?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  segmentId?: string;
}
