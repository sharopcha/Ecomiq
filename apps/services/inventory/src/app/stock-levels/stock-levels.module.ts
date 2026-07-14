import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLevel } from '../entities/stock-level.entity';
import { CatalogVariantSnapshot } from '../entities/catalog-variant-snapshot.entity';
import { CatalogProductSnapshot } from '../entities/catalog-product-snapshot.entity';
import { Location } from '../entities/location.entity';
import { StockLevelsController } from './stock-levels.controller';
import { StockLevelsService } from './stock-levels.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockLevel, CatalogVariantSnapshot, CatalogProductSnapshot, Location]),
  ],
  controllers: [StockLevelsController],
  providers: [StockLevelsService],
  exports: [StockLevelsService],
})
export class StockLevelsModule {}
