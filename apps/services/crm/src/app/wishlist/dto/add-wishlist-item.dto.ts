import { IsString, MinLength } from 'class-validator';
import type { AddWishlistItemRequestDto } from '@temp-nx/api-types/crm';

export class AddWishlistItemDto implements AddWishlistItemRequestDto {
  @IsString()
  @MinLength(1)
  variantId!: string;
}
