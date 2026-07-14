import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../entities/order.entity';
import { OrderLine } from '../entities/order-line.entity';
import { FulfillmentRollup } from '../entities/fulfillment-rollup.entity';
import { ShippingEventsController } from './shipping-events.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderLine, FulfillmentRollup])],
  controllers: [ShippingEventsController],
})
export class ShippingEventsModule {}
