import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileFolder } from '../entities/file-folder.entity';
import { ActivityLog } from '../entities/activity-log.entity';
import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';

@Module({
  imports: [TypeOrmModule.forFeature([FileFolder, ActivityLog])],
  controllers: [FoldersController],
  providers: [FoldersService],
  // FilesService depends on FoldersService (validating a file's folderId
  // belongs to the same store) — exported for FilesModule to import.
  exports: [FoldersService],
})
export class FoldersModule {}
