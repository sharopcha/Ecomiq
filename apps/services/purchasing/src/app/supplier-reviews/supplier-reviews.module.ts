import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from '../entities/supplier.entity';
import { SupplierReview } from '../entities/supplier-review.entity';
import { SupplierReviewsController } from './supplier-reviews.controller';
import { SupplierReviewsService } from './supplier-reviews.service';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, SupplierReview])],
  controllers: [SupplierReviewsController],
  providers: [SupplierReviewsService],
})
export class SupplierReviewsModule {}
