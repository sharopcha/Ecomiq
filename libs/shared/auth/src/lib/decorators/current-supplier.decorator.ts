import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedSupplier } from '../supplier-jwt-payload.interface';

/** `@CurrentSupplier() supplier: AuthenticatedSupplier` — populated by SupplierJwtAccessStrategy. */
export const CurrentSupplier = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedSupplier | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
