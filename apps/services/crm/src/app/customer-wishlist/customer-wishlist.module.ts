import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../entities/customer.entity';
import { WishlistModule } from '../wishlist/wishlist.module';
import { CustomerWishlistController } from './customer-wishlist.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Customer]), WishlistModule],
  controllers: [CustomerWishlistController],
})
export class CustomerWishlistModule {}
