import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../entities/order.entity';
import { OrderLine } from '../entities/order-line.entity';
import { OrderTag } from '../entities/order-tag.entity';
import { ActivityLog } from '../entities/activity-log.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

// `ActivityLog` isn't injected by `OrdersService` itself (writeActivityLog
// only needs the transaction's EntityManager, not a repo token) — it's
// registered here anyway so the repository token exists in this module's DI
// graph for callers that do need it directly (orders-demo.ts's verification
// query today; a future activity-feed read endpoint later).
@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderLine, OrderTag, ActivityLog])],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
