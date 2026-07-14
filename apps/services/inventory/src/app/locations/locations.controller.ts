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
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Controller('locations')
@UseGuards(PermissionsGuard)
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @RequirePermissions('inventory:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.locations.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('inventory:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.locations.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('inventory:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLocationDto) {
    return this.locations.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('inventory:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locations.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('inventory:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.locations.remove(user.storeId, id);
  }
}
