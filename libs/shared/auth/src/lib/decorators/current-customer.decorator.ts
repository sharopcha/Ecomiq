import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedCustomer } from '../customer-jwt-payload.interface';

/** `@CurrentCustomer() customer: AuthenticatedCustomer` — populated by CustomerJwtAccessStrategy. */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedCustomer | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
