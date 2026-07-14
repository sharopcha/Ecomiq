import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CustomerSource } from '../../entities/customer.entity';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  avatarFileId?: string;

  @IsOptional()
  @IsEnum(CustomerSource)
  source?: CustomerSource;
}
