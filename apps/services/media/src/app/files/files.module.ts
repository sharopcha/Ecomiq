import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileAsset } from '../entities/file-asset.entity';
import { ActivityLog } from '../entities/activity-log.entity';
import { FoldersModule } from '../folders/folders.module';
import { StorageModule } from '../storage/storage.module';
import { ExternalSourcesModule } from '../external-sources/external-sources.module';
import { FilesController } from './files.controller';
import { PublicFilesController } from './public-files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FileAsset, ActivityLog]),
    FoldersModule,
    StorageModule,
    ExternalSourcesModule,
  ],
  controllers: [FilesController, PublicFilesController],
  providers: [FilesService],
})
export class FilesModule {}
