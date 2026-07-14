import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Popup } from '../entities/popup.entity';
import { PopupsController } from './popups.controller';
import { PopupsService } from './popups.service';

@Module({
  imports: [TypeOrmModule.forFeature([Popup])],
  controllers: [PopupsController],
  providers: [PopupsService],
  exports: [PopupsService],
})
export class PopupsModule {}
