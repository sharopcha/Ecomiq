import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { StorefrontService } from './storefront.service';

@Controller('storefront/products')
@Public() // Bypasses the global staff JwtAuthGuard
export class StorefrontProductsController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get(':id/reviews')
  getReviews(@Param('id') productId: string, @Query() query: PaginationQueryDto) {
    return this.storefront.getPublicReviewsForProduct(productId, query);
  }
}
