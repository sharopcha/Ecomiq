import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { BundlesService } from './bundles.service';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { UpdateBundleDto } from './dto/update-bundle.dto';

@Controller('bundles')
@UseGuards(PermissionsGuard)
export class BundlesController {
  constructor(private readonly bundles: BundlesService) {}

  @Get()
  @RequirePermissions('products:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.bundles.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('products:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bundles.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('products:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBundleDto) {
    return this.bundles.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('products:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBundleDto,
  ) {
    return this.bundles.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('products:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bundles.remove(user.storeId, id);
  }
}
