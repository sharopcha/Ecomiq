import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { ReturnStatus } from '../../entities/return-request.entity';

export class FindReturnsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;

  @IsOptional()
  @IsString()
  orderId?: string;
}
