import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { NotifChannel } from '../../entities/shipment-notification.entity';

export class NotifyShipmentDto {
  @IsEnum(NotifChannel)
  channel!: NotifChannel;

  @IsString()
  @MinLength(1)
  toAddress!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  templateId?: string;
}
