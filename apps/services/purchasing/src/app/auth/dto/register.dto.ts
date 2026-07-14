import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * `storeId` is a required body field, not read off a JWT — this is a
 * `@Public()` endpoint (no principal exists yet), same reasoning as crm's
 * `RegisterDto`. No `name`/`fullName` field here — register claims an
 * *existing* supplier row (admin-created) by email; it never creates one,
 * so there's nothing else for the supplier to supply beyond credentials.
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
}
