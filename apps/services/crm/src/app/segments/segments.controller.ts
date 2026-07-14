import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { SegmentsService } from './segments.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';

@Controller('segments')
@UseGuards(PermissionsGuard)
export class SegmentsController {
  constructor(private readonly segments: SegmentsService) {}

  @Get()
  @RequirePermissions('people:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.segments.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('people:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.segments.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('people:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSegmentDto) {
    return this.segments.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('people:write')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSegmentDto) {
    return this.segments.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('people:manage')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.segments.remove(user.storeId, id);
  }

  @Post(':id/evaluate')
  @RequirePermissions('people:write')
  evaluate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.segments.evaluate(user.storeId, id);
  }
}
