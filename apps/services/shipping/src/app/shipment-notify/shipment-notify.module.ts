import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShipmentNotification } from '../entities/shipment-notification.entity';
import { ShipmentsModule } from '../shipments/shipments.module';
import { ShipmentNotifyController } from './shipment-notify.controller';
import { ShipmentNotifyService } from './shipment-notify.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([ShipmentNotification]), ShipmentsModule],
  controllers: [ShipmentNotifyController],
  providers: [ShipmentNotifyService],
})
export class ShipmentNotifyModule {}
