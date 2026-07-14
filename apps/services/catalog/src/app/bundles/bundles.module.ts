import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bundle } from '../entities/bundle.entity';
import { BundleItem } from '../entities/bundle-item.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import { BundlesController } from './bundles.controller';
import { BundlesService } from './bundles.service';

@Module({
  imports: [
    // BundlesService cross-checks variantIds against ProductVariant (joined
    // through its product) to enforce tenant ownership — same reason
    // ProductsModule also registers Category/Vendor/etc.
    TypeOrmModule.forFeature([Bundle, BundleItem, ProductVariant]),
  ],
  controllers: [BundlesController],
  providers: [BundlesService],
})
export class BundlesModule {}
