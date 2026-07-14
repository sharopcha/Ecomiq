import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { FilesService } from './files.service';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { FindFilesQueryDto } from './dto/find-files-query.dto';
import { RenameFileDto } from './dto/rename-file.dto';
import { MoveFileDto } from './dto/move-file.dto';
import { BulkDeleteFilesDto } from './dto/bulk-delete-files.dto';
import { TransformImageQueryDto } from './dto/transform-image-query.dto';
import { ImportFileDto } from './dto/import-file.dto';

@Controller('files')
@UseGuards(PermissionsGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  @RequirePermissions('media:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindFilesQueryDto) {
    return this.files.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('media:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.files.findOneWithDownloadUrl(user.storeId, id);
  }

  // 302s to a presigned GET rather than streaming bytes through this
  // controller — same "redirect, don't proxy" shape the public serving
  // route (Step 8) will use. @Res() puts Nest in full response-control
  // mode, so nothing is returned for Nest to also try to serialize.
  @Get(':id/image')
  @RequirePermissions('media:read')
  async transformImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: TransformImageQueryDto,
    @Res() res: Response,
  ) {
    const url = await this.files.getImageRedirectUrl(user.storeId, id, query);
    res.redirect(url);
  }

  @Post('presign')
  @RequirePermissions('media:write')
  presign(@CurrentUser() user: AuthenticatedUser, @Body() dto: PresignUploadDto) {
    return this.files.presign(user.storeId, dto);
  }

  @Post(':id/complete')
  @RequirePermissions('media:write')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.files.complete(user.storeId, id, user.id, dto);
  }

  @Patch(':id/rename')
  @RequirePermissions('media:write')
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RenameFileDto,
  ) {
    return this.files.rename(user.storeId, id, dto);
  }

  @Patch(':id/move')
  @RequirePermissions('media:write')
  move(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: MoveFileDto) {
    return this.files.moveToFolder(user.storeId, id, dto);
  }

  @Post('bulk-delete')
  @RequirePermissions('media:write')
  bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkDeleteFilesDto) {
    return this.files.removeMany(user.storeId, dto.ids);
  }

  @Post('import')
  @RequirePermissions('media:write')
  importFile(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportFileDto) {
    return this.files.importFile(user.storeId, user.id, dto);
  }

  @Delete(':id')
  @RequirePermissions('media:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.files.remove(user.storeId, id);
  }
}
