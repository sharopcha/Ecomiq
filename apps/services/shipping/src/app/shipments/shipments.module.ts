import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipment } from '../entities/shipment.entity';
import { ShipmentEvent } from '../entities/shipment-event.entity';
import { StoreSequence } from '../entities/store-sequence.entity';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { DelayCheckController } from './delay-check.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Shipment, ShipmentEvent, StoreSequence])],
  controllers: [ShipmentsController, DelayCheckController],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
