import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { PaymentsService } from './payments.service';
import { FindPaymentsQueryDto } from './dto/find-payments-query.dto';

/**
 * Root-mounted (`/api/payments` after the gateway strips its own prefix,
 * landing on this service's bare `/api`) — `GET /api/payments?orderId=`.
 * Mounted separately from `IntentsController` (`/intents` sub-resource)
 * rather than folding both onto one controller, since Nest controllers
 * take exactly one base path.
 *
 * This is the only reason the original scaffold's placeholder
 * `AppController` (`@Get()` at the same bare root) was removed — it had no
 * real purpose once a genuine root route existed, and the two would
 * otherwise collide.
 */
@Controller()
@UseGuards(PermissionsGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions('payments:read')
  findByOrder(@CurrentUser() user: AuthenticatedUser, @Query() query: FindPaymentsQueryDto) {
    return this.payments.listByOrder(user.storeId, query.orderId);
  }
}
