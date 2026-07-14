import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';

/**
 * Admin REST — creates on behalf of a customer (customer-authored review
 * comes with `/storefront` once CustomerJwtGuard exists, a later step).
 */
@Controller('reviews')
@UseGuards(PermissionsGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @RequirePermissions('people:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListReviewsQueryDto) {
    return this.reviews.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('people:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reviews.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('people:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user.storeId, dto);
  }

  @Post(':id/publish')
  @RequirePermissions('people:write')
  publish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reviews.publish(user.storeId, id);
  }

  @Post(':id/archive')
  @RequirePermissions('people:manage')
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reviews.archive(user.storeId, id);
  }
}
