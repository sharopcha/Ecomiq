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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';

@Controller('products')
@UseGuards(PermissionsGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions('products:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindProductsQueryDto) {
    return this.products.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('products:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.products.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('products:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto) {
    return this.products.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('products:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user.storeId, id, dto);
  }

  /** Soft delete (archive) — see ProductsService.remove. */
  @Delete(':id')
  @RequirePermissions('products:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.products.remove(user.storeId, id);
  }

  @Post(':id/restore')
  @RequirePermissions('products:write')
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.products.restore(user.storeId, id);
  }
}
