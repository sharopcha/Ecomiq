import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from '../entities/supplier.entity';
import { SupplierCatalogItem } from '../entities/supplier-catalog-item.entity';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { AutoDraftPoController } from './auto-draft-po.controller';
import { AutoDraftPoService } from './auto-draft-po.service';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, SupplierCatalogItem]), PurchaseOrdersModule],
  // AutoDraftPoController has no HTTP routes — dispatched by main.ts's
  // reorder-triggered Pulsar microservice connection, same as inventory's
  // OrderSyncController/PurchasingSyncController.
  controllers: [AutoDraftPoController],
  providers: [AutoDraftPoService],
})
export class AutoDraftPoModule {}
