import { IsOptional, IsString, MinLength } from 'class-validator';
import type { UpdateCustomerProfileRequestDto } from '@temp-nx/api-types/crm';

/**
 * Deliberately narrower than admin's `UpdateCustomerDto` — a customer can
 * update their own name/phone/avatar, but not `email` (a real change-email
 * flow needs its own verification step, out of scope here), `status`, or
 * `source`.
 */
export class UpdateStorefrontProfileDto implements UpdateCustomerProfileRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  avatarFileId?: string;
}
