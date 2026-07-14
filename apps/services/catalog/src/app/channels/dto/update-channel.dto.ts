import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { OrderChannelType } from '../../entities/channel.entity';

export class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(OrderChannelType)
  kind?: OrderChannelType;
}
