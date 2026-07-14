import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { LicenseKeyStatus } from '../../entities/license-key.entity';

/** Real DTO class (not an inline intersection type) — see FindCategoriesQueryDto's doc comment for why: an inline `PaginationQueryDto & {...}` erases to `Object` under emitDecoratorMetadata and silently disables ValidationPipe for the endpoint. */
export class FindLicenseKeysQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(LicenseKeyStatus)
  status?: LicenseKeyStatus;
}
