import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../entities/product.entity';
import { Category } from '../entities/category.entity';
import { ProductType } from '../entities/product-type.entity';
import { Vendor } from '../entities/vendor.entity';
import { Channel } from '../entities/channel.entity';
import { Tag } from '../entities/tag.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    // ProductsService cross-checks category/type/vendor/channel/tag ids
    // against their own tenant-scoped repos (resolveRefs) — all five need to
    // be registered here even though only Product is "owned" by this module.
    TypeOrmModule.forFeature([Product, Category, ProductType, Vendor, Channel, Tag]),
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
