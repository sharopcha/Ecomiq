import { UseGuards, applyDecorators } from '@nestjs/common';
import { CustomerJwtGuard } from '../guards/customer-jwt-auth.guard';

/** `@CustomerAuth()` on a controller or route — shorthand for `@UseGuards(CustomerJwtGuard)`. */
export const CustomerAuth = () => applyDecorators(UseGuards(CustomerJwtGuard));
