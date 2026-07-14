import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { ShipmentsService } from './shipments.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { TransitionShipmentDto } from './dto/transition-shipment.dto';
import { CreateShipmentEventDto } from './dto/create-shipment-event.dto';
import { DelayShipmentDto } from './dto/delay-shipment.dto';

@Controller('shipments')
@UseGuards(PermissionsGuard)
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get()
  @RequirePermissions('shipments:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.shipments.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('shipments:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shipments.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('shipments:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateShipmentDto) {
    return this.shipments.create(user.storeId, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('shipments:write')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shipments.cancel(user.storeId, id);
  }

  @Post(':id/transition')
  @RequirePermissions('shipments:write')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransitionShipmentDto,
  ) {
    return this.shipments.transition(user.storeId, id, dto.status);
  }

  @Post(':id/events')
  @RequirePermissions('shipments:write')
  addEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateShipmentEventDto,
  ) {
    return this.shipments.addEvent(user.storeId, id, dto);
  }

  @Post(':id/delay')
  @RequirePermissions('shipments:write')
  delay(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: DelayShipmentDto) {
    return this.shipments.delay(user.storeId, id, dto.reason);
  }
}
