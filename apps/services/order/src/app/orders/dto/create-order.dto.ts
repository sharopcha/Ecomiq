import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderChannelType, OrderStatus } from '../../entities/order.entity';

export class CreateOrderLineDto {
  /** Opaque `product_variant.id` — catalog-owned, no cross-DB FK (ADR-2). */
  @IsString()
  variantId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  variantLabel?: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsInt()
  @Min(0)
  unitPriceMinor!: number;

  @IsOptional()
  @IsString()
  imageFileId?: string;
}

/**
 * `status` accepts only `draft`/`open` here — anything else (`completed`,
 * `canceled`) is reached through a dedicated transition (`cancel()`, the
 * checkout saga), never a raw create body. Enforced in
 * `OrdersService.create`, not with a narrower DTO enum, since the error
 * message needs to name the two legal values explicitly.
 */
export class CreateOrderDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  channelId?: string;

  @IsOptional()
  @IsEnum(OrderChannelType)
  channelType?: OrderChannelType;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderLineDto)
  lines!: CreateOrderLineDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  shippingFeeMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  taxMinor?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsObject()
  shippingAddress?: Record<string, unknown>;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;
}
