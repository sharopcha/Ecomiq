import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentCustomer, CustomerAuth, AuthenticatedCustomer, Public } from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { StorefrontService } from './storefront.service';
import { CustomerAddressesService } from '../customer-addresses/customer-addresses.service';
import { WishlistService } from '../wishlist/wishlist.service';
import { ReferralsService } from '../referrals/referrals.service';
import { UpdateStorefrontProfileDto } from './dto/update-profile.dto';
import { CreateStorefrontReviewDto } from './dto/create-storefront-review.dto';
import { CreateAddressDto } from '../customer-addresses/dto/create-address.dto';
import { UpdateAddressDto } from '../customer-addresses/dto/update-address.dto';
import { AddWishlistItemDto } from '../wishlist/dto/add-wishlist-item.dto';
import type { ReferralCodeResponse } from '@temp-nx/api-types/crm';

/**
 * Customer-facing REST — `@Public()` bypasses the app's *global* staff
 * `JwtAuthGuard` (a customer JWT would never pass that guard — wrong
 * strategy, wrong JWKS, wrong issuer), and `@CustomerAuth()` is the real
 * gate: every route here requires a verified *customer* JWT instead.
 * `customerId`/`storeId` always come from the verified token
 * (`@CurrentCustomer()`), never a URL param or request body — a customer
 * can only ever act as themselves.
 */
@Controller('storefront')
@Public()
@CustomerAuth()
export class StorefrontController {
  constructor(
    private readonly storefront: StorefrontService,
    private readonly addresses: CustomerAddressesService,
    private readonly wishlist: WishlistService,
    private readonly referrals: ReferralsService,
  ) {}

  @Get('me')
  getMe(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.storefront.getProfile(customer.id, customer.storeId);
  }

  @Patch('me')
  updateMe(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: UpdateStorefrontProfileDto) {
    return this.storefront.updateProfile(customer.id, customer.storeId, dto);
  }

  @Get('addresses')
  findAddresses(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.addresses.findAll(customer.storeId, customer.id);
  }

  @Post('addresses')
  createAddress(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: CreateAddressDto) {
    return this.addresses.create(customer.storeId, customer.id, dto);
  }

  @Patch('addresses/:addressId')
  updateAddress(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addresses.update(customer.storeId, customer.id, addressId, dto);
  }

  @Delete('addresses/:addressId')
  removeAddress(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('addressId') addressId: string) {
    return this.addresses.remove(customer.storeId, customer.id, addressId);
  }

  @Post('reviews')
  createReview(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: CreateStorefrontReviewDto) {
    return this.storefront.createReview(customer.id, customer.storeId, dto);
  }

  @Get('wishlist')
  listWishlist(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.wishlist.list(customer.storeId, customer.id);
  }

  @Post('wishlist')
  async addWishlistItem(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: AddWishlistItemDto) {
    await this.wishlist.add(customer.storeId, customer.id, dto.variantId);
    return { status: 'ok' };
  }

  @Delete('wishlist/:variantId')
  async removeWishlistItem(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('variantId') variantId: string) {
    await this.wishlist.remove(customer.storeId, customer.id, variantId);
    return { status: 'ok' };
  }

  @Get('loyalty')
  getLoyalty(@CurrentCustomer() customer: AuthenticatedCustomer, @Query() query: PaginationQueryDto) {
    return this.storefront.getLoyalty(customer.id, customer.storeId, query);
  }

  @Get('referral-code')
  async getReferralCode(@CurrentCustomer() customer: AuthenticatedCustomer): Promise<ReferralCodeResponse> {
    const code = await this.referrals.getOrCreateCode(customer.storeId, customer.id);
    return { code };
  }

  @Get('referrals')
  listMyReferrals(@CurrentCustomer() customer: AuthenticatedCustomer, @Query() query: PaginationQueryDto) {
    return this.referrals.listMine(customer.storeId, customer.id, query);
  }
}
