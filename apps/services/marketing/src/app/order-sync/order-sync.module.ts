import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Discount } from '../entities/discount.entity';
import { DiscountUsage } from '../entities/discount-usage.entity';
import { OrderEventsController } from './order-events.controller';
import { OrderSyncService } from './order-sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([Discount, DiscountUsage])],
  controllers: [OrderEventsController],
  providers: [OrderSyncService],
})
export class OrderSyncModule {}
