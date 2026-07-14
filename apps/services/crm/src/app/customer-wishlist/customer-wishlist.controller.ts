import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { Customer } from '../entities/customer.entity';
import { assertCustomerOwned } from '../customers/customer-ownership.util';
import { WishlistService } from '../wishlist/wishlist.service';

/** Read-only — the Customer 360 wishlist tab. Adding/removing items is customer-initiated only (`/storefront/wishlist`). */
@Controller('customers/:customerId/wishlist')
@UseGuards(PermissionsGuard)
export class CustomerWishlistController {
  constructor(
    private readonly wishlist: WishlistService,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
  ) {}

  @Get()
  @RequirePermissions('people:read')
  async findAll(@CurrentUser() user: AuthenticatedUser, @Param('customerId') customerId: string) {
    await assertCustomerOwned(this.customerRepo, user.storeId, customerId);
    return this.wishlist.list(user.storeId, customerId);
  }
}
