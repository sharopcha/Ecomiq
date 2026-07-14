import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipment } from '../entities/shipment.entity';
import { TrackingNumber } from '../entities/tracking-number.entity';
import { RedisModule } from '../redis/redis.module';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  imports: [TypeOrmModule.forFeature([Shipment, TrackingNumber]), RedisModule],
  controllers: [TrackingController],
  providers: [TrackingService],
})
export class TrackingModule {}
