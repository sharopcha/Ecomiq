import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * `storeId` is a required body field, not read off a JWT — these are
 * `@Public()` endpoints (no principal exists yet), and per this repo's
 * public-multi-tenant precedent (shipping's `TrackingController` puts
 * `storeSlugOrId` in the URL path), the tenant must be resolved from the
 * request itself rather than trusted context. A path param reads awkwardly
 * for a POST-with-body endpoint, so it's a body field here instead.
 */
export class RegisterDto {
  @IsString()
  @MinLength(1)
  storeId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;

  @IsString()
  @MinLength(1)
  fullName!: string;

  /** Creates a `pending` referral row — resolved to a real referrer once referral code generation ships. */
  @IsOptional()
  @IsString()
  referralCode?: string;
}
