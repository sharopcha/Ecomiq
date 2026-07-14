import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersQueryDto } from './dto/list-suppliers-query.dto';

@Controller('suppliers')
@UseGuards(PermissionsGuard)
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermissions('purchasing:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListSuppliersQueryDto) {
    return this.suppliers.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('purchasing:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.suppliers.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('purchasing:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupplierDto) {
    return this.suppliers.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('purchasing:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliers.update(user.storeId, id, dto);
  }

  @Post(':id/activate')
  @RequirePermissions('purchasing:manage')
  activate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.suppliers.activate(user.storeId, id);
  }

  @Post(':id/deactivate')
  @RequirePermissions('purchasing:manage')
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.suppliers.deactivate(user.storeId, id);
  }

  @Post(':id/toggle-feature')
  @RequirePermissions('purchasing:manage')
  toggleFeature(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.suppliers.toggleFeature(user.storeId, id);
  }

  @Post(':id/toggle-favorite')
  @RequirePermissions('purchasing:manage')
  toggleFavorite(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.suppliers.toggleFavorite(user.storeId, id);
  }
}
