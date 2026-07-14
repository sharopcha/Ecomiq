import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { LabelsService } from './labels.service';
import { CreateShippingLabelDto } from './dto/create-shipping-label.dto';
import { UpdateShippingLabelDto } from './dto/update-shipping-label.dto';

@Controller('labels')
@UseGuards(PermissionsGuard)
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get()
  @RequirePermissions('shipments:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.labels.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('shipments:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.labels.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('shipments:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateShippingLabelDto) {
    return this.labels.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('shipments:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateShippingLabelDto,
  ) {
    return this.labels.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('shipments:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.labels.remove(user.storeId, id);
  }

  @Post(':id/purchase')
  @RequirePermissions('shipments:write')
  purchase(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.labels.purchase(user.storeId, id);
  }
}
