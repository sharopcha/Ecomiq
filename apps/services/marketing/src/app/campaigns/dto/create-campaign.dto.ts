import { IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { CampaignKind } from '../../entities/campaign.entity';

export class CreateCampaignDto {
  @IsEnum(CampaignKind)
  kind!: CampaignKind;

  @IsString()
  @MinLength(1)
  title!: string;

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
