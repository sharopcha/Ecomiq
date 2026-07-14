import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { StorefrontService } from './storefront.service';
import { FindStorefrontProductsDto } from './dto/storefront-query.dto';
import { CartValidateDto } from './dto/cart-validate.dto';
import { Public } from '@temp-nx/auth';

@Controller('storefront')
@Public() // Added because JwtAuthGuard is global in catalog, otherwise these fail with 401
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Get('products')
  async getProducts(@Query() query: FindStorefrontProductsDto) {
    return this.storefrontService.findAllProducts(query);
  }

  @Get('products/:id')
  async getProduct(@Param('id') id: string) {
    return this.storefrontService.findProductById(id);
  }

  @Get('categories')
  async getCategories(@Query('storeId') storeId?: string) {
    return this.storefrontService.findCategories(storeId);
  }

  @Post('cart/validate')
  async validateCart(@Body() dto: CartValidateDto) {
    return this.storefrontService.validateCart(dto);
  }
}
