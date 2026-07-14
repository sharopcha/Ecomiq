import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { PoStatus } from '../../entities/purchase-order.entity';

export class ListPurchaseOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PoStatus)
  status?: PoStatus;

  @IsOptional()
  @IsString()
  supplierId?: string;
}
