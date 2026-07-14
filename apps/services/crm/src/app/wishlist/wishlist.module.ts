import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WishlistItem } from '../entities/wishlist-item.entity';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [TypeOrmModule.forFeature([WishlistItem])],
  providers: [WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}
