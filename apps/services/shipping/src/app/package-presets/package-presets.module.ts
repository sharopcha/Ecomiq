import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PackagePreset } from '../entities/package-preset.entity';
import { PackagePresetsController } from './package-presets.controller';
import { PackagePresetsService } from './package-presets.service';

@Module({
  imports: [TypeOrmModule.forFeature([PackagePreset])],
  controllers: [PackagePresetsController],
  providers: [PackagePresetsService],
  exports: [PackagePresetsService],
})
export class PackagePresetsModule {}
