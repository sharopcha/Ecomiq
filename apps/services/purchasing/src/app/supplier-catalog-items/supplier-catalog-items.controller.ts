import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { SupplierCatalogItemsService } from './supplier-catalog-items.service';
import { CreateSupplierCatalogItemDto } from './dto/create-supplier-catalog-item.dto';
import { UpdateSupplierCatalogItemDto } from './dto/update-supplier-catalog-item.dto';
import { ListSupplierCatalogItemsQueryDto } from './dto/list-supplier-catalog-items-query.dto';

@Controller('suppliers/:supplierId/catalog-items')
@UseGuards(PermissionsGuard)
export class SupplierCatalogItemsController {
  constructor(private readonly items: SupplierCatalogItemsService) {}

  @Get()
  @RequirePermissions('purchasing:read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId') supplierId: string,
    @Query() query: ListSupplierCatalogItemsQueryDto,
  ) {
    return this.items.findAll(user.storeId, supplierId, query);
  }

  @Get(':id')
  @RequirePermissions('purchasing:read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId') supplierId: string,
    @Param('id') id: string,
  ) {
    return this.items.findOne(user.storeId, supplierId, id);
  }

  @Post()
  @RequirePermissions('purchasing:write')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId') supplierId: string,
    @Body() dto: CreateSupplierCatalogItemDto,
  ) {
    return this.items.create(user.storeId, supplierId, dto);
  }

  @Patch(':id')
  @RequirePermissions('purchasing:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId') supplierId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierCatalogItemDto,
  ) {
    return this.items.update(user.storeId, supplierId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('purchasing:write')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId') supplierId: string,
    @Param('id') id: string,
  ) {
    return this.items.remove(user.storeId, supplierId, id);
  }

  @Post(':id/toggle-in-stock')
  @RequirePermissions('purchasing:write')
  toggleInStock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId') supplierId: string,
    @Param('id') id: string,
  ) {
    return this.items.toggleInStock(user.storeId, supplierId, id);
  }
}
