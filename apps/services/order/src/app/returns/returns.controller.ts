import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { ReturnsService } from './returns.service';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';
import { RejectReturnDto } from './dto/reject-return.dto';
import { ResolveReturnDto } from './dto/resolve-return.dto';
import { FindReturnsQueryDto } from './dto/find-returns-query.dto';

/**
 * `/api/orders/returns/*` — a sibling resource under order-service's own
 * bare `/api` root (the gateway's `/api/orders/*` proxy already forwards
 * everything past `/orders`, so `@Controller('returns')` here lands
 * exactly there), same "sub-resource gets its own path segment" pattern as
 * inventory's `@Controller('reservations')`.
 */
@Controller('returns')
@UseGuards(PermissionsGuard)
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @RequirePermissions('orders:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindReturnsQueryDto) {
    return this.returns.list(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('orders:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.returns.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('orders:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReturnRequestDto) {
    return this.returns.create(user.storeId, dto);
  }

  @Post(':id/approve')
  @RequirePermissions('orders:write')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.returns.approve(user.storeId, id);
  }

  @Post(':id/reject')
  @RequirePermissions('orders:write')
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RejectReturnDto) {
    return this.returns.reject(user.storeId, id, dto.reason);
  }

  @Post(':id/inspect')
  @RequirePermissions('orders:write')
  inspect(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.returns.inspect(user.storeId, id);
  }

  @Post(':id/resolve')
  @RequirePermissions('orders:write')
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ResolveReturnDto) {
    return this.returns.resolve(user.storeId, id, dto.refundType);
  }

  @Post(':id/shipping-status/advance')
  @RequirePermissions('orders:write')
  advanceShippingStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.returns.advanceShippingStatus(user.storeId, id);
  }
}
