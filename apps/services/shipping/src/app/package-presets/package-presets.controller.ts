import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { PackagePresetsService } from './package-presets.service';
import { CreatePackagePresetDto } from './dto/create-package-preset.dto';
import { UpdatePackagePresetDto } from './dto/update-package-preset.dto';

@Controller('package-presets')
@UseGuards(PermissionsGuard)
export class PackagePresetsController {
  constructor(private readonly presets: PackagePresetsService) {}

  @Get()
  @RequirePermissions('shipments:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.presets.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('shipments:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.presets.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('shipments:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePackagePresetDto) {
    return this.presets.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('shipments:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePackagePresetDto,
  ) {
    return this.presets.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('shipments:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.presets.remove(user.storeId, id);
  }
}
