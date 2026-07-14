import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TemplateKind } from '../../entities/email-template.entity';

export class UpdateTemplateDto {
  @IsOptional()
  @IsEnum(TemplateKind)
  kind?: TemplateKind;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsBoolean()
  isAiRecommended?: boolean;
}
