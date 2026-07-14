import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { PopupStatus } from '../../entities/popup.entity';

export class UpdatePopupDto {
  @IsOptional()
  @IsObject()
  schema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  displayRules?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(PopupStatus)
  status?: PopupStatus;
}
