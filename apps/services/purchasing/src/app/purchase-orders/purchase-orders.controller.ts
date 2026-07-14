import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';

@Controller('purchase-orders')
@UseGuards(PermissionsGuard)
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Get()
  @RequirePermissions('purchasing:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListPurchaseOrdersQueryDto) {
    return this.purchaseOrders.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('purchasing:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.purchaseOrders.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('purchasing:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrders.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('purchasing:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.purchaseOrders.update(user.storeId, id, dto);
  }

  @Post(':id/send')
  @RequirePermissions('purchasing:write')
  send(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.purchaseOrders.send(user.storeId, id);
  }

  @Post(':id/confirm')
  @RequirePermissions('purchasing:write')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.purchaseOrders.confirm(user.storeId, id);
  }

  @Post(':id/receive')
  @RequirePermissions('purchasing:write')
  receive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    return this.purchaseOrders.receive(user.storeId, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('purchasing:write')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.purchaseOrders.cancel(user.storeId, id);
  }
}
