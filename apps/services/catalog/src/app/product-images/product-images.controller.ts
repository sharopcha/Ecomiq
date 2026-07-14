import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { ProductImagesService } from './product-images.service';
import { AttachProductImageDto } from './dto/attach-product-image.dto';
import { ReorderProductImagesDto } from './dto/reorder-product-images.dto';

@Controller('products/:productId/images')
@UseGuards(PermissionsGuard)
export class ProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @Get()
  @RequirePermissions('products:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Param('productId') productId: string) {
    return this.images.findAll(user.storeId, productId);
  }

  @Post()
  @RequirePermissions('products:write')
  attach(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() dto: AttachProductImageDto,
  ) {
    return this.images.attach(user.storeId, productId, dto);
  }

  @Patch('reorder')
  @RequirePermissions('products:write')
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() dto: ReorderProductImagesDto,
  ) {
    return this.images.reorder(user.storeId, productId, dto);
  }

  @Delete(':imageId')
  @RequirePermissions('products:write')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.images.remove(user.storeId, productId, imageId);
  }
}
