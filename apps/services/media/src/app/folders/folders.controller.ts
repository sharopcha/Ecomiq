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
import { FoldersService } from './folders.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { RenameFolderDto } from './dto/rename-folder.dto';
import { MoveFolderDto } from './dto/move-folder.dto';
import { FindFoldersQueryDto } from './dto/find-folders-query.dto';

@Controller('folders')
@UseGuards(PermissionsGuard)
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  @RequirePermissions('media:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindFoldersQueryDto) {
    return this.folders.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('media:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.folders.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('media:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFolderDto) {
    return this.folders.create(user.storeId, dto);
  }

  @Patch(':id/rename')
  @RequirePermissions('media:write')
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RenameFolderDto,
  ) {
    return this.folders.rename(user.storeId, id, dto);
  }

  @Patch(':id/move')
  @RequirePermissions('media:write')
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MoveFolderDto,
  ) {
    return this.folders.move(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('media:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.folders.remove(user.storeId, id);
  }
}
