import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Refund } from '../entities/refund.entity';
import { Order } from '../entities/order.entity';
import { ReturnRequest } from '../entities/return-request.entity';
import { ReturnsModule } from '../returns/returns.module';
import { OrderRefundsController } from './order-refunds.controller';
import { RefundsController } from './refunds.controller';
import { RefundEventsController } from './refund-events.controller';
import { RefundsService } from './refunds.service';

@Module({
  imports: [TypeOrmModule.forFeature([Refund, Order, ReturnRequest]), ReturnsModule],
  // RefundEventsController has no HTTP routes — dispatched by the same
  // payment-events::order-service PulsarServer connection
  // PaymentEventsController uses (main.ts), just a different
  // @EventPattern set.
  controllers: [OrderRefundsController, RefundsController, RefundEventsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
