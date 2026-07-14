import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  storeId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
