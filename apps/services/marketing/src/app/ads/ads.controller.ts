import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { AdsService } from './ads.service';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';

/** `/api/marketing/ads/*` — same convention as `DiscountsController`/`CampaignsController`. */
@Controller('ads')
@UseGuards(PermissionsGuard)
export class AdsController {
  constructor(private readonly ads: AdsService) {}

  @Get()
  @RequirePermissions('campaign:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.ads.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('campaign:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ads.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('campaign:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAdDto) {
    return this.ads.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('campaign:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateAdDto) {
    return this.ads.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('campaign:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ads.remove(user.storeId, id);
  }
}
