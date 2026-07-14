import { IsDateString, IsEmail, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { OrderChannelType } from '../../entities/order.entity';

/**
 * Header-only fields — line items, totals, note, and tags each have their
 * own dedicated endpoint (deliberately separate from generic "update").
 * `OrdersService.update` additionally enforces draft/open-only at the
 * service layer, not here — a DTO can't see the entity's current status.
 */
export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  channelId?: string;

  @IsOptional()
  @IsEnum(OrderChannelType)
  channelType?: OrderChannelType;

  @IsOptional()
  @IsObject()
  shippingAddress?: Record<string, unknown>;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsDateString()
  estimatedArrivalStart?: string;

  @IsOptional()
  @IsDateString()
  estimatedArrivalEnd?: string;
}
