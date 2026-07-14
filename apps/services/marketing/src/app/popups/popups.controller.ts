import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { PopupsService } from './popups.service';
import { CreatePopupDto } from './dto/create-popup.dto';
import { UpdatePopupDto } from './dto/update-popup.dto';

/** `/api/marketing/popups/*` — same convention as `DiscountsController`/`CampaignsController`. */
@Controller('popups')
@UseGuards(PermissionsGuard)
export class PopupsController {
  constructor(private readonly popups: PopupsService) {}

  @Get()
  @RequirePermissions('campaign:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.popups.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('campaign:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.popups.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('campaign:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePopupDto) {
    return this.popups.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('campaign:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdatePopupDto) {
    return this.popups.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('campaign:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.popups.remove(user.storeId, id);
  }
}
