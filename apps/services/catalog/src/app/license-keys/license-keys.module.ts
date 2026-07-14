import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../entities/product.entity';
import { LicenseKey } from '../entities/license-key.entity';
import { LicenseKeysController } from './license-keys.controller';
import { LicenseKeysService } from './license-keys.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, LicenseKey])],
  controllers: [LicenseKeysController],
  providers: [LicenseKeysService],
})
export class LicenseKeysModule {}
