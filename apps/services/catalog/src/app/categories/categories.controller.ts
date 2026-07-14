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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FindCategoriesQueryDto } from './dto/find-categories-query.dto';

@Controller('categories')
@UseGuards(PermissionsGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions('products:read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FindCategoriesQueryDto,
  ) {
    return this.categories.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('products:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.categories.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('products:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.categories.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('products:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('products:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.categories.remove(user.storeId, id);
  }
}
