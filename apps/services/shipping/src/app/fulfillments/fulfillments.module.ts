import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Fulfillment } from '../entities/fulfillment.entity';
import { FulfillmentLine } from '../entities/fulfillment-line.entity';
import { TrackingNumber } from '../entities/tracking-number.entity';
import { Shipment } from '../entities/shipment.entity';
import { FulfillmentsController } from './fulfillments.controller';
import { FulfillmentsService } from './fulfillments.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Fulfillment, FulfillmentLine, TrackingNumber, Shipment]),
  ],
  controllers: [FulfillmentsController],
  providers: [FulfillmentsService],
  exports: [FulfillmentsService],
})
export class FulfillmentsModule {}
