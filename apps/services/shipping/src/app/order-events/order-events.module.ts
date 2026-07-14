import { Module } from '@nestjs/common';
import { ShipmentsModule } from '../shipments/shipments.module';
import { OrderEventsController } from './order-events.controller';

@Module({
  imports: [ShipmentsModule],
  controllers: [OrderEventsController],
})
export class OrderEventsModule {}
