import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { RefundsService } from './refunds.service';
import { CreateRefundDto } from './dto/create-refund.dto';

/**
 * `POST/GET /api/orders/:orderId/refunds` — order-scoped create/list. A
 * two-segment path (`:orderId/refunds`), so it doesn't collide with
 * `OrdersController`'s bare `/:id` the way `ReturnsController`'s
 * one-segment `/returns` did — no module-registration-order fix needed
 * here.
 */
@Controller()
@UseGuards(PermissionsGuard)
export class OrderRefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Post(':orderId/refunds')
  @RequirePermissions('orders:write')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: CreateRefundDto,
  ) {
    return this.refunds.create(user.storeId, orderId, dto);
  }

  @Get(':orderId/refunds')
  @RequirePermissions('orders:read')
  list(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.refunds.listByOrder(user.storeId, orderId);
  }
}
