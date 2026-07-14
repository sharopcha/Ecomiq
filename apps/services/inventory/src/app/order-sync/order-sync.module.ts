import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { OrderSyncController } from './order-sync.controller';
import { OrderSyncService } from './order-sync.service';

@Module({
  imports: [ReservationsModule],
  // OrderSyncController has no HTTP routes — dispatched by main.ts's
  // order-events Pulsar microservice connection, same as CatalogSyncController.
  controllers: [OrderSyncController],
  providers: [OrderSyncService],
})
export class OrderSyncModule {}
