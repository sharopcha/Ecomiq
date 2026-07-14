import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { FulfillmentsService } from './fulfillments.service';
import { CreateFulfillmentDto } from './dto/create-fulfillment.dto';

@Controller('fulfillments')
@UseGuards(PermissionsGuard)
export class FulfillmentsController {
  constructor(private readonly fulfillments: FulfillmentsService) {}

  @Get()
  @RequirePermissions('shipments:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.fulfillments.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('shipments:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.fulfillments.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('shipments:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFulfillmentDto) {
    return this.fulfillments.create(user.storeId, dto);
  }
}
