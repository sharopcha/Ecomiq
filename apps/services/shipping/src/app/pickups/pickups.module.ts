import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pickup } from '../entities/pickup.entity';
import { Shipment } from '../entities/shipment.entity';
import { PickupsController } from './pickups.controller';
import { PickupsService } from './pickups.service';
import { PickupReminderController } from './pickup-reminder.controller';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Pickup, Shipment])],
  controllers: [PickupsController, PickupReminderController],
  providers: [PickupsService],
  exports: [PickupsService],
})
export class PickupsModule {}
