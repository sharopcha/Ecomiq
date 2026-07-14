import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { ProductVariantsService } from './product-variants.service';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';

@Controller('products/:productId/variants')
@UseGuards(PermissionsGuard)
export class ProductVariantsController {
  constructor(private readonly variants: ProductVariantsService) {}

  @Get()
  @RequirePermissions('products:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Param('productId') productId: string) {
    return this.variants.findAll(user.storeId, productId);
  }

  @Get(':variantId')
  @RequirePermissions('products:read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.variants.findOne(user.storeId, productId, variantId);
  }

  @Post()
  @RequirePermissions('products:write')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() dto: CreateProductVariantDto,
  ) {
    return this.variants.create(user.storeId, productId, dto);
  }

  /** Fills in every option-value combination the product doesn't already have a variant for. */
  @Post('generate-matrix')
  @RequirePermissions('products:write')
  generateMatrix(@CurrentUser() user: AuthenticatedUser, @Param('productId') productId: string) {
    return this.variants.generateMatrix(user.storeId, productId);
  }

  @Patch(':variantId')
  @RequirePermissions('products:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.variants.update(user.storeId, productId, variantId, dto);
  }

  @Delete(':variantId')
  @RequirePermissions('products:write')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.variants.remove(user.storeId, productId, variantId);
  }
}
