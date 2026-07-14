import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { CustomerSource, CustomerStatus } from '../../entities/customer.entity';

export class ListCustomersQueryDto extends PaginationQueryDto {
  /** ILIKE match against full_name/email — inventory's stock-levels precedent, no trigram index. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CustomerSource)
  source?: CustomerSource;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;
}
