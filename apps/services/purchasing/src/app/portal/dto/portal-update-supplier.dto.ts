import { IsEmail, IsOptional, IsString } from 'class-validator';

/**
 * `PATCH /portal/me` — contact fields only. Deliberately narrower than the
 * admin `UpdateSupplierDto`: no `name`/`description`/`locationLabel`/
 * `shippingCarriers` (business-identity fields) and no `status`/
 * `isFeatured`/`isFavorite` (merchant-owned, not exposed on this DTO at
 * all — there's no field for a supplier to even attempt setting them).
 * Passed straight into `SuppliersService.update()`, whose `manager.merge()`
 * only touches whatever fields are actually present on the DTO.
 */
export class PortalUpdateSupplierDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;
}
