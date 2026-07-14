import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../entities/customer.entity';
import { ReviewRequest } from '../entities/review-request.entity';
import { ReviewsModule } from '../reviews/reviews.module';
import { CustomerAddressesModule } from '../customer-addresses/customer-addresses.module';
import { WishlistModule } from '../wishlist/wishlist.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { StorefrontController } from './storefront.controller';
import { StorefrontProductsController } from './storefront-products.controller';
import { StorefrontService } from './storefront.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, ReviewRequest]),
    ReviewsModule,
    CustomerAddressesModule,
    WishlistModule,
    LoyaltyModule,
    ReferralsModule,
  ],
  controllers: [StorefrontController, StorefrontProductsController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
