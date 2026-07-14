import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogProductSnapshot } from '../entities/catalog-product-snapshot.entity';
import { CatalogVariantSnapshot } from '../entities/catalog-variant-snapshot.entity';
import { CatalogSyncController } from './catalog-sync.controller';
import { CatalogSyncService } from './catalog-sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([CatalogProductSnapshot, CatalogVariantSnapshot])],
  controllers: [CatalogSyncController],
  providers: [CatalogSyncService],
})
export class CatalogSyncModule {}
