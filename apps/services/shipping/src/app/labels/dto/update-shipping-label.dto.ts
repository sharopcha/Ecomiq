import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateShippingLabelPackageDto } from './create-shipping-label.dto';

/**
 * `packages`, when present, replaces the label's entire package set —
 * "here is the label's contents now" rather than a diffed add/remove/update,
 * same replace-all approach as catalog's Bundle.items.
 */
export class UpdateShippingLabelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  orderId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  carrier?: string;

  @IsOptional()
  @IsString()
  serviceType?: string;

  @IsOptional()
  @IsString()
  insurance?: string;

  @IsOptional()
  @IsDateString()
  shipDate?: string;

  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean;

  @IsOptional()
  @IsObject()
  returnAddress?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  destinationAddress?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateShippingLabelPackageDto)
  packages?: CreateShippingLabelPackageDto[];
}
