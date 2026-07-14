import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Controller('templates')
@UseGuards(PermissionsGuard)
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermissions('notifications:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.templates.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('notifications:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.templates.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('notifications:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTemplateDto) {
    return this.templates.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('notifications:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templates.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('notifications:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.templates.remove(user.storeId, id);
  }
}
