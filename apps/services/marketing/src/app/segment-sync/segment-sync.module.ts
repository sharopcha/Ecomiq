import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SegmentSnapshot } from '../entities/segment-snapshot.entity';
import { SegmentSyncController } from './segment-sync.controller';
import { SegmentSyncService } from './segment-sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([SegmentSnapshot])],
  controllers: [SegmentSyncController],
  providers: [SegmentSyncService],
  exports: [SegmentSyncService],
})
export class SegmentSyncModule {}
