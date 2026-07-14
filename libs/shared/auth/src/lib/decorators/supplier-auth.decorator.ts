import { UseGuards, applyDecorators } from '@nestjs/common';
import { SupplierJwtGuard } from '../guards/supplier-jwt-auth.guard';

/** `@SupplierAuth()` on a controller or route — shorthand for `@UseGuards(SupplierJwtGuard)`. */
export const SupplierAuth = () => applyDecorators(UseGuards(SupplierJwtGuard));
