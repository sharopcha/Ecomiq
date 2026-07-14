import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { ReviewRequestsService } from './review-requests.service';
import { CreateReviewRequestDto } from './dto/create-review-request.dto';

@Controller('review-requests')
@UseGuards(PermissionsGuard)
export class ReviewRequestsController {
  constructor(private readonly reviewRequests: ReviewRequestsService) {}

  @Get()
  @RequirePermissions('people:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.reviewRequests.findAll(user.storeId, query);
  }

  @Post()
  @RequirePermissions('people:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReviewRequestDto) {
    return this.reviewRequests.create(user.storeId, dto);
  }
}
