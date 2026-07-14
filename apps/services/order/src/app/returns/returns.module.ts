import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReturnRequest } from '../entities/return-request.entity';
import { ReturnLine } from '../entities/return-line.entity';
import { Refund } from '../entities/refund.entity';
import { OrderCommentsModule } from '../comments/order-comments.module';
import { ReturnsController } from './returns.controller';
import { ReturnCommentsController } from './return-comments.controller';
import { ReturnExpiryController } from './return-expiry.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReturnRequest, ReturnLine, Refund]), OrderCommentsModule],
  // ReturnExpiryController has no HTTP routes — dispatched by the second
  // PulsarServer connection wired in main.ts, same as
  // ReservationExpiryController/RefundCommandsController.
  controllers: [ReturnsController, ReturnCommentsController, ReturnExpiryController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
