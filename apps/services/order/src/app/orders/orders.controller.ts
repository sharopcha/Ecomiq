import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { SetOrderNoteDto } from './dto/set-order-note.dto';
import { AddOrderTagDto } from './dto/add-order-tag.dto';
import { FindOrdersQueryDto } from './dto/find-orders-query.dto';

/**
 * Root-mounted (`/api/orders` after the gateway strips its own prefix,
 * landing on this service's bare `/api` — see `OrderProxyController`'s doc
 * comment). This is the reason the placeholder `AppController` (`@Get()`
 * at the same bare root) was removed, same collision/fix as
 * payment-service's `PaymentsController`.
 */
@Controller()
@UseGuards(PermissionsGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions('orders:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindOrdersQueryDto) {
    return this.orders.list(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('orders:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('orders:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('orders:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.orders.update(user.storeId, id, dto);
  }

  @Post(':id/confirm')
  @RequirePermissions('orders:write')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.confirm(user.storeId, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('orders:write')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CancelOrderDto) {
    return this.orders.cancel(user.storeId, id, dto.reason);
  }

  @Post(':id/stage/advance')
  @RequirePermissions('orders:write')
  advanceStage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.advanceStage(user.storeId, id);
  }

  @Patch(':id/note')
  @RequirePermissions('orders:write')
  setNote(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SetOrderNoteDto) {
    return this.orders.setNote(user.storeId, id, dto.note);
  }

  @Post(':id/tags')
  @RequirePermissions('orders:write')
  addTag(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AddOrderTagDto) {
    return this.orders.addTag(user.storeId, id, dto.tagId);
  }

  @Delete(':id/tags/:tagId')
  @RequirePermissions('orders:write')
  removeTag(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('tagId') tagId: string) {
    return this.orders.removeTag(user.storeId, id, tagId);
  }
}
