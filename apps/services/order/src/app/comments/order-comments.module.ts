import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderComment } from '../entities/order-comment.entity';
import { OrdersModule } from '../orders/orders.module';
import { OrderCommentsController } from './order-comments.controller';
import { OrderCommentsService } from './order-comments.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderComment]), OrdersModule],
  controllers: [OrderCommentsController],
  providers: [OrderCommentsService],
  // Exported so ReturnCommentsController can reuse the same
  // generic-over-subjectTable service for the `return_request` subject
  // instead of a copy-pasted comments service.
  exports: [OrderCommentsService],
})
export class OrderCommentsModule {}
