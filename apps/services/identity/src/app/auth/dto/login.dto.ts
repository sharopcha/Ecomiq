import { IsEmail, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  /** Optional — only needed when a user has memberships in more than one store. */
  @IsOptional()
  @IsString()
  storeId?: string;
}
