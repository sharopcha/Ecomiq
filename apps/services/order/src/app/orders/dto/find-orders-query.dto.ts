import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { FulfillmentStatus, OrderPaymentStatus, OrderStatus } from '../../entities/order.entity';

/**
 * The Order list's default filter set — all five filters sit on the
 * covering index columns
 * (`(store_id, order_date DESC)`, `(store_id, payment_status,
 * fulfillment_status)`), so this is a cheap index-only scan even at scale.
 */
export class FindOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderPaymentStatus)
  paymentStatus?: OrderPaymentStatus;

  @IsOptional()
  @IsEnum(FulfillmentStatus)
  fulfillmentStatus?: FulfillmentStatus;

  /** Inclusive lower bound on `order_date` (ISO 8601). */
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  /** Inclusive upper bound on `order_date` (ISO 8601). */
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @IsString()
  customerId?: string;
}
