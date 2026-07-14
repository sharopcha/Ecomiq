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
import { ProductTypesService } from './product-types.service';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';

@Controller('product-types')
@UseGuards(PermissionsGuard)
export class ProductTypesController {
  constructor(private readonly productTypes: ProductTypesService) {}

  @Get()
  @RequirePermissions('products:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.productTypes.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('products:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.productTypes.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('products:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductTypeDto) {
    return this.productTypes.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('products:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductTypeDto,
  ) {
    return this.productTypes.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('products:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.productTypes.remove(user.storeId, id);
  }
}
