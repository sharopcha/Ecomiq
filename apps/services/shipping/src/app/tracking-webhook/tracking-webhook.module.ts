import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackingNumber } from '../entities/tracking-number.entity';
import { Shipment } from '../entities/shipment.entity';
import { ShipmentEvent } from '../entities/shipment-event.entity';
import { ShipmentsModule } from '../shipments/shipments.module';
import { TrackingWebhookController } from './tracking-webhook.controller';
import { TrackingWebhookService } from './tracking-webhook.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([TrackingNumber, Shipment, ShipmentEvent]),
    ShipmentsModule,
  ],
  controllers: [TrackingWebhookController],
  providers: [TrackingWebhookService],
})
export class TrackingWebhookModule {}
