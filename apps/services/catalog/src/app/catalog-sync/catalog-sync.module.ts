import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../entities/product.entity';
import { CatalogSyncController } from './catalog-sync.controller';
import { CatalogSyncService } from './catalog-sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [CatalogSyncController],
  providers: [CatalogSyncService],
})
export class CatalogSyncModule {}
