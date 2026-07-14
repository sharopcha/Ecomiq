import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { SupplierReviewsService } from './supplier-reviews.service';
import { CreateSupplierReviewDto } from './dto/create-supplier-review.dto';

@Controller('suppliers/:supplierId/reviews')
@UseGuards(PermissionsGuard)
export class SupplierReviewsController {
  constructor(private readonly reviews: SupplierReviewsService) {}

  @Get()
  @RequirePermissions('purchasing:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Param('supplierId') supplierId: string) {
    return this.reviews.findAll(user.storeId, supplierId);
  }

  @Post()
  @RequirePermissions('purchasing:write')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId') supplierId: string,
    @Body() dto: CreateSupplierReviewDto,
  ) {
    return this.reviews.create(user.storeId, supplierId, dto);
  }

  @Delete(':id')
  @RequirePermissions('purchasing:write')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId') supplierId: string,
    @Param('id') id: string,
  ) {
    return this.reviews.remove(user.storeId, supplierId, id);
  }
}
