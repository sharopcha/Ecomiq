import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { PickupsService } from './pickups.service';
import { BulkSchedulePickupDto } from './dto/bulk-schedule-pickup.dto';

@Controller('pickups')
@UseGuards(PermissionsGuard)
export class PickupsController {
  constructor(private readonly pickups: PickupsService) {}

  @Get()
  @RequirePermissions('shipments:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.pickups.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('shipments:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.pickups.findOne(user.storeId, id);
  }

  @Post('bulk')
  @RequirePermissions('shipments:write')
  scheduleBulk(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkSchedulePickupDto) {
    return this.pickups.scheduleBulk(user.storeId, dto.pickups);
  }
}
