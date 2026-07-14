import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLevel } from '../entities/stock-level.entity';
import { Location } from '../entities/location.entity';
import { CatalogVariantSnapshot } from '../entities/catalog-variant-snapshot.entity';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { PurchasingSyncController } from './purchasing-sync.controller';
import { PurchasingSyncService } from './purchasing-sync.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockLevel, Location, CatalogVariantSnapshot]),
    StockMovementsModule,
  ],
  // PurchasingSyncController has no HTTP routes — dispatched by main.ts's
  // purchasing po-events Pulsar microservice connection, same as
  // OrderSyncController/CatalogSyncController.
  controllers: [PurchasingSyncController],
  providers: [PurchasingSyncService],
})
export class PurchasingSyncModule {}
