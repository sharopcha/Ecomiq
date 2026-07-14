import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SetupStoreDto {
  @IsString()
  @IsNotEmpty()
  setupToken!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @IsOptional()
  countryCode?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  organizationName?: string;

  @IsString()
  @IsNotEmpty()
  storeName!: string;

  @IsString()
  @IsOptional()
  defaultCurrency?: string;

  @IsString()
  @IsOptional()
  category?: string;
}
