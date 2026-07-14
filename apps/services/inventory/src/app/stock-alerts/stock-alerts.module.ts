import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockAlert } from '../entities/stock-alert.entity';
import { CatalogVariantSnapshot } from '../entities/catalog-variant-snapshot.entity';
import { Location } from '../entities/location.entity';
import { StockAlertsController } from './stock-alerts.controller';
import { StockAlertsService } from './stock-alerts.service';

@Module({
  imports: [TypeOrmModule.forFeature([StockAlert, CatalogVariantSnapshot, Location])],
  controllers: [StockAlertsController],
  providers: [StockAlertsService],
  exports: [StockAlertsService],
})
export class StockAlertsModule {}
