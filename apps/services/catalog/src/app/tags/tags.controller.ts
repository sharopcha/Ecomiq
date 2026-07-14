import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Controller('tags')
@UseGuards(PermissionsGuard)
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @RequirePermissions('products:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.tags.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('products:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tags.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('products:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTagDto) {
    return this.tags.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('products:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tags.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('products:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tags.remove(user.storeId, id);
  }
}
