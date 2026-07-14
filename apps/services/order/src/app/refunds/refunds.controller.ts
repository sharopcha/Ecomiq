import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { RefundsService } from './refunds.service';
import { DeclineRefundDto } from './dto/decline-refund.dto';

/**
 * `/api/orders/refunds/*` — a static top-level base (`@Controller('refunds')`),
 * same "sibling resource under order-service's own bare root" pattern as
 * `ReturnsController`. Three segments deep (`refunds/:id/approve`) so,
 * unlike `/returns`, this never collides with `OrdersController`'s
 * one-segment `/:id` regardless of module registration order.
 */
@Controller('refunds')
@UseGuards(PermissionsGuard)
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get(':id')
  @RequirePermissions('orders:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.refunds.findOne(user.storeId, id);
  }

  @Post(':id/approve')
  @RequirePermissions('orders:write')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.refunds.approve(user.storeId, id);
  }

  @Post(':id/decline')
  @RequirePermissions('orders:write')
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: DeclineRefundDto) {
    return this.refunds.decline(user.storeId, id, dto.reason);
  }
}
